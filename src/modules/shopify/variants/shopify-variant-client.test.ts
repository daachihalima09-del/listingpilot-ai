import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyVariantClient,
  friendlyShopifyVariantError,
  ShopifyVariantClientError,
} from './shopify-variant-client.ts';

const configuration = {
  version: 1,
  options: [],
  variants: [{
    optionValues: [],
    price: '10.00',
    compareAtPrice: null,
    sku: null,
    barcode: null,
  }],
};

const configurationDto = {
  ...configuration,
  variants: [{
    ...configuration.variants[0],
    published: false,
    firstPublishedAt: null,
    lastPublishedAt: null,
  }],
};

test('saves configuration without Shopify IDs or tenant identifiers', async () => {
  let url = '';
  let body = '';
  const client = createShopifyVariantClient(async (requestUrl, init) => {
    url = String(requestUrl);
    body = String(init?.body);
    return Response.json({ configuration: configurationDto });
  });
  await client.save(
    '11111111-1111-4111-8111-111111111111',
    configuration,
  );
  assert.match(url, /shopify-variants$/);
  assert.equal(JSON.parse(body).workspaceId, undefined);
  assert.equal(body.includes('shopifyVariantId'), false);
});

test('prevents duplicate publish submissions', async () => {
  let calls = 0;
  let resolveRequest: ((response: Response) => void) | undefined;
  const client = createShopifyVariantClient(() => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  });
  const first = client.publish('11111111-1111-4111-8111-111111111111');
  const second = client.publish('11111111-1111-4111-8111-111111111111');
  assert.equal(calls, 1);
  resolveRequest?.(Response.json({
    outcome: 'UNCHANGED',
    created: 0,
    updated: 0,
    unchanged: 1,
    unmanagedRemote: 0,
    currencyCode: 'USD',
    message: 'No changes.',
    configuration: configurationDto,
  }));
  assert.deepEqual(await first, await second);
});

test('maps timeout, rate-limit, and validation errors safely', () => {
  assert.match(
    friendlyShopifyVariantError('SHOPIFY_VARIANT_TIMEOUT'),
    /too long/i,
  );
  assert.match(
    friendlyShopifyVariantError('SHOPIFY_VARIANT_RATE_LIMITED'),
    /busy/i,
  );
  assert.match(
    friendlyShopifyVariantError('SHOPIFY_VARIANT_VALIDATION_FAILED'),
    /rejected/i,
  );
});

test('rejects malformed responses without rendering raw secrets', async () => {
  const client = createShopifyVariantClient(async () => Response.json({
    accessToken: 'secret',
  }));
  await assert.rejects(
    client.publish('11111111-1111-4111-8111-111111111111'),
    (error) => error instanceof ShopifyVariantClientError
      && error.code === 'MALFORMED_RESPONSE'
      && !error.message.includes('secret'),
  );
});
