import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyAdminRequest,
} from '../admin/admin-api-client-core.ts';
import {
  createShopifyProductCreationRepository,
} from './product-creation-repository.ts';

test('sends one supported GraphQL create-product request through the authenticated Admin client', async () => {
  let capturedWorkspaceId = '';
  let capturedRequest: ShopifyAdminRequest | undefined;
  const repository = createShopifyProductCreationRepository(
    async (workspaceId, request) => {
      capturedWorkspaceId = workspaceId;
      capturedRequest = request;
      return {
        data: {
          data: { productCreate: { product: { id: 'gid://shopify/Product/1', title: 'Product', handle: 'product', status: 'DRAFT' }, userErrors: [] } },
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
  assert.equal(capturedWorkspaceId, 'workspace-1');
  assert.equal(capturedRequest?.method, 'POST');
  assert.equal(capturedRequest?.path, '/graphql.json');
  const body = capturedRequest?.body as { query: string; variables: { product: unknown } };
  assert.match(body.query, /productCreate/u);
  assert.deepEqual(body.variables.product, { title: 'Product', status: 'ACTIVE' });
  assert.deepEqual(response, {
    product: {
      id: '1',
      title: 'Product',
      handle: 'product',
      status: 'draft',
    },
  });
});

test('maps GraphQL userErrors to a safe product validation error', async () => {
  const repository = createShopifyProductCreationRepository(async () => ({
    data: { data: { productCreate: { product: null, userErrors: [{ field: ['title'], message: 'invalid' }] } } }, status: 200, requestId: 'request-1', apiCallLimit: null,
  }));
  await assert.rejects(repository.create('workspace-1', { product: { title: 'Product', tags: '', status: 'draft' } }), /Shopify rejected/u);
});
