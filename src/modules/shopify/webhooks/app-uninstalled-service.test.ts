import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  handleShopifyAppUninstalled,
  ShopifyWebhookError,
} from './app-uninstalled-service.ts';

const secret = 'webhook-secret';
const rawBody = new TextEncoder().encode('{"id":123}');
const hmac = createHmac('sha256', secret).update(rawBody).digest('base64');

test('accepts a valid uninstall webhook and normalizes its trusted shop header', async () => {
  let receivedShop = '';
  const result = await handleShopifyAppUninstalled({
    apiSecret: secret,
    store: {
      async disconnectByShopDomain(shopDomain) {
        receivedShop = shopDomain;
        return { disconnected: 1 };
      },
    },
  }, {
    rawBody,
    hmac,
    shopHeader: 'Example.myshopify.com',
    topic: 'app/uninstalled',
  });
  assert.equal(receivedShop, 'example.myshopify.com');
  assert.deepEqual(result, { disconnected: 1 });
});

test('rejects invalid HMAC, invalid shops, and unrelated topics', async () => {
  const store = { async disconnectByShopDomain() { return { disconnected: 0 }; } };
  for (const input of [
    { rawBody, hmac: 'A'.repeat(43) + '=', shopHeader: 'example.myshopify.com', topic: 'app/uninstalled' },
    { rawBody, hmac, shopHeader: 'attacker.example', topic: 'app/uninstalled' },
    { rawBody, hmac, shopHeader: 'example.myshopify.com', topic: 'products/create' },
  ]) {
    await assert.rejects(
      handleShopifyAppUninstalled({ apiSecret: secret, store }, input),
      ShopifyWebhookError,
    );
  }
});

test('unknown and duplicate uninstall deliveries remain safe and idempotent', async () => {
  let calls = 0;
  const store = {
    async disconnectByShopDomain() {
      calls += 1;
      return { disconnected: 0 };
    },
  };
  const input = {
    rawBody,
    hmac,
    shopHeader: 'example.myshopify.com',
    topic: 'app/uninstalled',
  };
  assert.deepEqual(
    await handleShopifyAppUninstalled({ apiSecret: secret, store }, input),
    { disconnected: 0 },
  );
  assert.deepEqual(
    await handleShopifyAppUninstalled({ apiSecret: secret, store }, input),
    { disconnected: 0 },
  );
  assert.equal(calls, 2);
});

