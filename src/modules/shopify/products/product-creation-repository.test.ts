import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyAdminRequest,
} from '../admin/admin-api-client-core.ts';
import {
  createShopifyProductCreationRepository,
} from './product-creation-repository.ts';

test('sends one POST product request through the authenticated Admin client', async () => {
  let captured: {
    workspaceId: string;
    request: ShopifyAdminRequest;
  } | null = null;
  const repository = createShopifyProductCreationRepository(
    async (workspaceId, request) => {
      captured = { workspaceId, request };
      return {
        data: {
          product: {
            id: 1,
            title: 'Product',
            handle: 'product',
            status: 'active',
          },
        },
        status: 201,
        requestId: 'request-1',
        apiCallLimit: '1/40',
      };
    },
  );
  const payload = {
    product: {
      title: 'Product',
      tags: '',
      status: 'active' as const,
    },
  };

  const response = await repository.create('workspace-1', payload);
  assert.deepEqual(captured, {
    workspaceId: 'workspace-1',
    request: {
      method: 'POST',
      path: '/products.json',
      body: payload,
    },
  });
  assert.deepEqual(response, {
    product: {
      id: 1,
      title: 'Product',
      handle: 'product',
      status: 'active',
    },
  });
});
