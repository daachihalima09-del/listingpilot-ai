import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyAdminApiRequester } from '../admin/admin-api-client-core.ts';
import { createShopifyProductService } from './product-service.ts';

test('creates a workspace-bound product service without CRUD behavior', () => {
  const adminApi: ShopifyAdminApiRequester = {
    async request() {
      return {
        data: null,
        status: 200,
        requestId: null,
        apiCallLimit: null,
      };
    },
  };
  const service = createShopifyProductService('workspace-1', adminApi);
  assert.equal(service.workspaceId, 'workspace-1');
  assert.equal(service.adminApi, adminApi);
  assert.deepEqual(Object.keys(service).sort(), ['adminApi', 'workspaceId']);
  assert.equal(Object.isFrozen(service), true);
});
