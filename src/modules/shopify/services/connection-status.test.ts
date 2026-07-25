import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getShopifyConnectionStatus,
  type ShopifyConnectionStatusStore,
} from './connection-status.ts';

const workspaceId = 'workspace-1';
const connectedAt = new Date('2026-07-25T12:00:00.000Z');

test('an active member receives a client-safe Shopify status DTO', async () => {
  const requestedWorkspaces: string[] = [];
  const store: ShopifyConnectionStatusStore = {
    async findByWorkspaceId(requestedWorkspaceId) {
      requestedWorkspaces.push(requestedWorkspaceId);
      return {
        status: 'CONNECTED',
        shopDomain: 'example.myshopify.com',
        shopName: 'Example',
        grantedScopes: ['read_products'],
        installedAt: connectedAt,
        lastVerifiedAt: connectedAt,
        disconnectedAt: null,
      };
    },
  };
  const result = await getShopifyConnectionStatus(store, {
    workspaceId,
    role: 'MEMBER',
  });

  assert.deepEqual(requestedWorkspaces, [workspaceId]);
  assert.equal(result.canManage, false);
  assert.equal(result.shopDomain, 'example.myshopify.com');
  assert.equal('accessTokenEncrypted' in result, false);
  assert.equal(JSON.stringify(result).includes('secret-token'), false);
});

test('status reads only from the active workspace and does not expose another store', async () => {
  const store: ShopifyConnectionStatusStore = {
    async findByWorkspaceId(requestedWorkspaceId) {
      assert.equal(requestedWorkspaceId, 'active-workspace');
      return null;
    },
  };
  const result = await getShopifyConnectionStatus(store, {
    workspaceId: 'active-workspace',
    role: 'VIEWER',
  });
  assert.equal(result.status, 'NOT_CONNECTED');
  assert.equal(result.shopDomain, null);
});

test('only owners receive management capability in the status DTO', async () => {
  const store: ShopifyConnectionStatusStore = {
    async findByWorkspaceId() {
      return null;
    },
  };
  const result = await getShopifyConnectionStatus(store, {
    workspaceId,
    role: 'OWNER',
  });
  assert.equal(result.canManage, true);
});
