import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  handleShopifyComplianceWebhook,
  type ShopifyComplianceWebhookStore,
} from './compliance-service.ts';
import {
  MAX_SHOPIFY_WEBHOOK_BODY_BYTES,
  readShopifyWebhookBody,
  ShopifyWebhookRequestError,
  type ShopifyComplianceTopic,
} from './webhook-request.ts';

const secret = 'compliance-secret';

function signedInput(
  topic: ShopifyComplianceTopic,
  body: Record<string, unknown> = {
    shop_id: 123,
    shop_domain: 'example.myshopify.com',
  },
  overrides: Record<string, string> = {},
) {
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  const hmac = createHmac('sha256', secret).update(rawBody).digest('base64');
  return {
    rawBody,
    headers: new Headers({
      'content-type': 'application/json',
      'x-shopify-hmac-sha256': hmac,
      'x-shopify-shop-domain': 'Example.myshopify.com',
      'x-shopify-topic': topic,
      'x-shopify-webhook-id': `delivery-${topic}`,
      'x-shopify-event-id': `event-${topic}`,
      'x-shopify-api-version': '2026-07',
      'x-shopify-triggered-at': '2026-08-29T12:00:00Z',
      ...overrides,
    }),
  };
}

function memoryStore(knownShop = true): ShopifyComplianceWebhookStore & {
  deliveries: string[];
} {
  const deliveries: string[] = [];
  return {
    deliveries,
    async record(input) {
      const duplicate = deliveries.includes(input.webhookId);
      if (!duplicate) deliveries.push(input.webhookId);
      return {
        duplicate,
        knownShop,
        outcome: knownShop
          ? input.topic === 'shop/redact'
            ? 'SHOP_REDACTION_POLICY_PENDING'
            : 'NO_CUSTOMER_DATA_STORED'
          : 'UNKNOWN_SHOP',
      };
    },
  };
}

test('accepts every mandatory compliance topic after raw-body HMAC verification', async () => {
  for (const topic of [
    'customers/data_request',
    'customers/redact',
    'shop/redact',
  ] as const) {
    const store = memoryStore();
    const result = await handleShopifyComplianceWebhook(
      { apiSecret: secret, store },
      signedInput(topic),
    );
    assert.equal(result.topic, topic);
    assert.equal(result.shopDomain, 'example.myshopify.com');
    assert.equal(result.shopId, '123');
    assert.equal(result.knownShop, true);
    assert.deepEqual(store.deliveries, [`delivery-${topic}`]);
  }
});

test('rejects invalid and malformed HMAC before dispatch', async () => {
  for (const supplied of ['A'.repeat(43) + '=', 'malformed']) {
    const input = signedInput('customers/data_request', undefined, {
      'x-shopify-hmac-sha256': supplied,
    });
    const store = memoryStore();
    await assert.rejects(
      handleShopifyComplianceWebhook({ apiSecret: secret, store }, input),
      (error: unknown) => {
        assert.ok(error instanceof ShopifyWebhookRequestError);
        assert.equal(error.statusCode, 401);
        return true;
      },
    );
    assert.deepEqual(store.deliveries, []);
  }
});

test('verifies the exact raw bytes rather than a reserialized JSON object', async () => {
  const rawBody = new TextEncoder().encode(
    '{ "shop_id": 123, "shop_domain": "example.myshopify.com" }',
  );
  const compact = new TextEncoder().encode(
    '{"shop_id":123,"shop_domain":"example.myshopify.com"}',
  );
  const input = signedInput('customers/data_request');
  input.rawBody = rawBody;
  input.headers.set(
    'x-shopify-hmac-sha256',
    createHmac('sha256', secret).update(compact).digest('base64'),
  );
  await assert.rejects(
    handleShopifyComplianceWebhook(
      { apiSecret: secret, store: memoryStore() },
      input,
    ),
    (error: unknown) => error instanceof ShopifyWebhookRequestError
      && error.statusCode === 401,
  );
});

test('malformed JSON and mismatched payload shops are rejected after authentication', async () => {
  const malformedBody = new TextEncoder().encode('{');
  const malformed = signedInput('customers/redact');
  malformed.rawBody = malformedBody;
  malformed.headers.set(
    'x-shopify-hmac-sha256',
    createHmac('sha256', secret).update(malformedBody).digest('base64'),
  );
  await assert.rejects(
    handleShopifyComplianceWebhook(
      { apiSecret: secret, store: memoryStore() },
      malformed,
    ),
    (error: unknown) => error instanceof ShopifyWebhookRequestError
      && error.statusCode === 400,
  );

  await assert.rejects(
    handleShopifyComplianceWebhook(
      { apiSecret: secret, store: memoryStore() },
      signedInput('shop/redact', {
        shop_id: 123,
        shop_domain: 'other.myshopify.com',
      }),
    ),
    ShopifyWebhookRequestError,
  );
});

test('unknown shops acknowledge safely and duplicate deliveries are idempotent', async () => {
  const unknown = await handleShopifyComplianceWebhook(
    { apiSecret: secret, store: memoryStore(false) },
    signedInput('customers/data_request'),
  );
  assert.equal(unknown.outcome, 'UNKNOWN_SHOP');

  const store = memoryStore();
  const input = signedInput('customers/redact');
  const first = await handleShopifyComplianceWebhook({ apiSecret: secret, store }, input);
  const second = await handleShopifyComplianceWebhook({ apiSecret: secret, store }, input);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(store.deliveries, ['delivery-customers/redact']);
});

test('bounded body reader rejects declared and streamed oversized requests', async () => {
  await assert.rejects(
    readShopifyWebhookBody(new Request('https://app.example/webhook', {
      method: 'POST',
      headers: { 'content-length': String(MAX_SHOPIFY_WEBHOOK_BODY_BYTES + 1) },
      body: '{}',
    })),
    (error: unknown) => error instanceof ShopifyWebhookRequestError
      && error.statusCode === 413,
  );

  await assert.rejects(
    readShopifyWebhookBody(new Request('https://app.example/webhook', {
      method: 'POST',
      body: new Uint8Array(MAX_SHOPIFY_WEBHOOK_BODY_BYTES + 1),
    })),
    ShopifyWebhookRequestError,
  );
});
