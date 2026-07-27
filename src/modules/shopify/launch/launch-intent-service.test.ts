import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyLaunchIntent,
  resolveShopifyLaunchIntent,
  type ShopifyLaunchIntentStore,
} from './launch-intent-service.ts';
import type { ShopifyLaunchIntentRecord } from './launch-intent.ts';
import { ShopifyLaunchError } from './launch-errors.ts';

function memoryStore(): {
  store: ShopifyLaunchIntentStore;
  records: ShopifyLaunchIntentRecord[];
} {
  const records: ShopifyLaunchIntentRecord[] = [];
  return {
    records,
    store: {
      async create(input) {
        const record: ShopifyLaunchIntentRecord = {
          id: '11111111-1111-4111-8111-111111111111',
          ...input,
          status: 'PENDING',
          requestedWorkspaceId: null,
          selectedByUserId: null,
          consumedAt: null,
        };
        records.push(record);
        return record;
      },
      async findByNonceHash(hash) {
        return records.find(({ nonceHash }) => nonceHash === hash) ?? null;
      },
      async findById(id) {
        return records.find((record) => record.id === id) ?? null;
      },
      async selectWorkspace() { return true; },
      async markOAuthStarted() { return true; },
      async consume() { return true; },
      async expire(id) {
        const record = records.find((item) => item.id === id);
        if (record) record.status = 'EXPIRED';
      },
    },
  };
}

test('creates a short-lived database record containing only a nonce hash', async () => {
  const { store, records } = memoryStore();
  const now = new Date('2026-07-27T12:00:00.000Z');
  const created = await createShopifyLaunchIntent(store, {
    shopDomain: 'example.myshopify.com',
    origin: 'SHOPIFY_LAUNCH',
    now,
  });
  assert.match(created.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(records[0].nonceHash, created.nonce);
  assert.equal(records[0].expiresAt.toISOString(), '2026-07-27T12:15:00.000Z');
  assert.equal(JSON.stringify(records[0]).includes('hmac'), false);
  assert.equal(JSON.stringify(records[0]).includes('host'), false);
  assert.equal(await resolveShopifyLaunchIntent(store, created.nonce, now), records[0]);
});

test('rejects tampered, expired, and consumed continuation identifiers', async () => {
  const { store, records } = memoryStore();
  const created = await createShopifyLaunchIntent(store, {
    shopDomain: 'example.myshopify.com',
    origin: 'SHOPIFY_LAUNCH',
    now: new Date('2026-07-27T12:00:00.000Z'),
  });
  await assert.rejects(
    resolveShopifyLaunchIntent(store, `${created.nonce.slice(0, -1)}x`),
    ShopifyLaunchError,
  );
  await assert.rejects(
    resolveShopifyLaunchIntent(
      store,
      created.nonce,
      new Date('2026-07-27T12:16:00.000Z'),
    ),
    ShopifyLaunchError,
  );
  records[0].status = 'COMPLETED';
  records[0].consumedAt = new Date();
  await assert.rejects(
    resolveShopifyLaunchIntent(store, created.nonce),
    ShopifyLaunchError,
  );
});

