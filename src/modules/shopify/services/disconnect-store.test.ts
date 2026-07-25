import assert from 'node:assert/strict';
import test from 'node:test';
import {
  disconnectShopifyStore,
  type ShopifyDisconnectDatabase,
  type ShopifyDisconnectTransaction,
} from './disconnect-store.ts';
import { ShopifyForbiddenError } from '../types/errors.ts';

const disconnectedAt = new Date('2026-07-25T12:00:00.000Z');

function createDatabase(alreadyDisconnected = false) {
  const operations: string[] = [];
  let record = {
    id: 'store-1',
    shopDomain: 'example.myshopify.com',
    status: alreadyDisconnected ? 'DISCONNECTED' : 'CONNECTED',
    accessTokenEncrypted: alreadyDisconnected ? null : 'encrypted-secret-token',
    disconnectedAt: alreadyDisconnected ? disconnectedAt : null,
  };
  const transaction: ShopifyDisconnectTransaction = {
    shopifyStore: {
      async findUnique(args) {
        operations.push('find');
        assert.equal(args.where.workspaceId, 'workspace-1');
        return record;
      },
      async update(args) {
        operations.push('update');
        record = {
          ...record,
          ...args.data,
        };
        return { id: record.id };
      },
    },
    auditLog: {
      async create(args) {
        operations.push('audit');
        assert.deepEqual(args.data, {
          organizationId: 'organization-1',
          workspaceId: 'workspace-1',
          userId: 'user-1',
          action: 'shopify.store_disconnected',
          entityType: 'ShopifyStore',
          entityId: 'store-1',
          metadata: { shopDomain: 'example.myshopify.com' },
        });
        return { id: 'audit-1' };
      },
    },
  };
  const database: ShopifyDisconnectDatabase = {
    async $transaction(operation) {
      return operation(transaction);
    },
  };
  return { database, operations, getRecord: () => record };
}

const input = {
  actorUserId: 'user-1',
  organizationId: 'organization-1',
  workspaceId: 'workspace-1',
  role: 'OWNER',
  disconnectedAt,
};

test('disconnect requires OWNER authorization before database access', async () => {
  const context = createDatabase();
  await assert.rejects(
    disconnectShopifyStore(context.database, { ...input, role: 'MEMBER' }),
    ShopifyForbiddenError,
  );
  assert.deepEqual(context.operations, []);
});

test('disconnect clears token material, records state, and creates an audit event', async () => {
  const context = createDatabase();
  assert.deepEqual(
    await disconnectShopifyStore(context.database, input),
    { disconnected: true },
  );
  assert.deepEqual(context.operations, ['find', 'update', 'audit']);
  assert.equal(context.getRecord().status, 'DISCONNECTED');
  assert.equal(context.getRecord().accessTokenEncrypted, null);
  assert.equal(context.getRecord().disconnectedAt, disconnectedAt);
});

test('repeated disconnect is safe and does not duplicate its audit event', async () => {
  const context = createDatabase(true);
  assert.deepEqual(
    await disconnectShopifyStore(context.database, input),
    { disconnected: true },
  );
  assert.deepEqual(context.operations, ['find']);
});
