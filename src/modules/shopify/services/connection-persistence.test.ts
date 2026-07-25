import assert from 'node:assert/strict';
import test from 'node:test';
import {
  persistShopifyConnection,
  type ShopifyConnectionDatabase,
  type ShopifyConnectionTransaction,
  type ShopifyStoreRecord,
} from './connection-persistence.ts';
import { ShopifyDuplicateShopError } from '../types/errors.ts';

const input = {
  actorUserId: 'user-1',
  organizationId: 'organization-1',
  workspaceId: 'workspace-1',
  shopDomain: 'example.myshopify.com',
  shopName: 'Example',
  accessTokenEncrypted: 'encrypted-new-token',
  requestedScopes: ['read_products'],
  grantedScopes: ['read_products'],
  verifiedAt: new Date('2026-07-25T12:00:00.000Z'),
};

function createDatabase(initialStore: ShopifyStoreRecord | null = null) {
  let store = initialStore
    ? { ...initialStore, status: 'CONNECTED' as const }
    : null;
  let storedToken: string | null = initialStore ? 'encrypted-old-token' : null;
  const audits: unknown[] = [];

  const transaction: ShopifyConnectionTransaction = {
    shopifyStore: {
      async findUnique(args) {
        if (!store) return null;
        if (
          args.where.shopDomain === store.shopDomain
          || args.where.workspaceId === store.workspaceId
        ) return store;
        return null;
      },
      async create(args) {
        store = {
          id: 'store-1',
          workspaceId: args.data.workspaceId,
          shopDomain: args.data.shopDomain,
          status: 'CONNECTED',
        };
        storedToken = args.data.accessTokenEncrypted;
        return store;
      },
      async update(args) {
        assert.equal(args.where.id, store?.id);
        store = {
          id: args.where.id,
          workspaceId: args.data.workspaceId,
          shopDomain: args.data.shopDomain,
          status: 'CONNECTED',
        };
        storedToken = args.data.accessTokenEncrypted;
        return store;
      },
    },
    auditLog: {
      async create(args) {
        audits.push(args.data);
        return { id: 'audit-1' };
      },
    },
  };
  const database: ShopifyConnectionDatabase = {
    async $transaction(operation) {
      return operation(transaction);
    },
  };
  return {
    database,
    audits,
    getStore: () => store,
    getStoredToken: () => storedToken,
  };
}

test('persists a verified connection and creates its audit event atomically', async () => {
  const context = createDatabase();
  const result = await persistShopifyConnection(context.database, input);
  assert.equal(result.reconnected, false);
  assert.equal(context.getStoredToken(), 'encrypted-new-token');
  assert.deepEqual(context.audits, [{
    organizationId: 'organization-1',
    workspaceId: 'workspace-1',
    userId: 'user-1',
    action: 'shopify.store_connected',
    entityType: 'ShopifyStore',
    entityId: 'store-1',
    metadata: {
      shopDomain: 'example.myshopify.com',
      grantedScopes: ['read_products'],
    },
  }]);
});

test('reconnect updates the token only inside verified persistence', async () => {
  const context = createDatabase({
    id: 'store-1',
    workspaceId: 'workspace-1',
    shopDomain: 'example.myshopify.com',
  });
  const result = await persistShopifyConnection(context.database, input);
  assert.equal(result.reconnected, true);
  assert.equal(context.getStoredToken(), 'encrypted-new-token');
  assert.equal(
    (context.audits[0] as { action: string }).action,
    'shopify.store_reconnected',
  );
});

test('rejects a shop connected to another workspace without mutation', async () => {
  const context = createDatabase({
    id: 'other-store',
    workspaceId: 'workspace-2',
    shopDomain: 'example.myshopify.com',
  });
  await assert.rejects(
    persistShopifyConnection(context.database, input),
    ShopifyDuplicateShopError,
  );
  assert.equal(context.getStoredToken(), 'encrypted-old-token');
  assert.deepEqual(context.audits, []);
});
