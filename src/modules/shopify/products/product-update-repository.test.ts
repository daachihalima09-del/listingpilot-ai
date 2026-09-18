import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyAdminRequest } from '../admin/admin-api-client-core.ts';
import { ShopifyAdminApiError } from '../admin/errors.ts';
import { ShopifyProductPublishError } from './product-errors.ts';
import {
  createShopifyProductUpdateRepository,
} from './product-update-repository.ts';

const remoteProduct = {
  id: 'gid://shopify/Product/987654321',
  legacyResourceId: '987654321',
  title: 'Product',
  handle: 'product',
  descriptionHtml: '<p>Description</p>',
  vendor: 'Vendor',
  productType: 'Type',
  tags: ['One', 'Two'],
  status: 'DRAFT',
  updatedAt: '2026-08-29T00:00:00Z',
};

test('uses exact GraphQL identity and sends only selected update fields', async () => {
  const requests: Array<{ workspaceId: string; request: ShopifyAdminRequest }> = [];
  const repository = createShopifyProductUpdateRepository(
    async (workspaceId, request) => {
      requests.push({ workspaceId, request });
      const query = String((request.body as { query?: string }).query);
      return {
        data: query.includes('productUpdate')
          ? { data: { productUpdate: { product: remoteProduct, userErrors: [] } } }
          : { data: { product: remoteProduct } },
        status: 200,
        requestId: 'request-1',
      };
    },
  );

  const current = await repository.findCurrent('workspace-1', '987654321');
  const updated = await repository.update('workspace-1', '987654321', {
    product: { id: '987654321', title: 'Updated', status: 'draft' },
  });

  assert.deepEqual(current, {
    product: {
      id: '987654321', title: 'Product', handle: 'product',
      body_html: '<p>Description</p>', vendor: 'Vendor', product_type: 'Type',
      tags: 'One, Two', status: 'draft', updated_at: '2026-08-29T00:00:00Z',
    },
  });
  assert.deepEqual(updated, current);
  assert.equal(requests.every(({ request }) => request.path === '/graphql.json'), true);
  assert.deepEqual(
    (requests[0]?.request.body as { variables: unknown }).variables,
    { id: 'gid://shopify/Product/987654321' },
  );
  assert.equal(requests[0]?.request.retrySafe, true);
  assert.deepEqual(
    (requests[1]?.request.body as { variables: unknown }).variables,
    {
      product: {
        id: 'gid://shopify/Product/987654321',
        title: 'Updated',
        status: 'DRAFT',
      },
    },
  );
});

test('rejects cross-product identity and GraphQL user errors safely', async () => {
  const repository = createShopifyProductUpdateRepository(async () => ({
    data: { data: { productUpdate: { product: null, userErrors: [{ field: ['title'], message: 'private detail' }] } } },
    status: 200,
    requestId: 'request-1',
  }));
  await assert.rejects(
    repository.update('workspace-1', '987654321', {
      product: { id: '123', title: 'Injected' },
    }),
    ShopifyAdminApiError,
  );
  await assert.rejects(
    repository.update('workspace-1', '987654321', {
      product: { id: '987654321', title: 'Invalid' },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyProductPublishError);
      assert.equal(error.code, 'SHOPIFY_PRODUCT_VALIDATION_FAILED');
      assert.equal(error.message.includes('private detail'), false);
      return true;
    },
  );
});

test('maps GraphQL throttling and missing exact products', async () => {
  const throttled = createShopifyProductUpdateRepository(async () => ({
    data: { errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }] },
    status: 200,
    requestId: 'request-1',
  }));
  await assert.rejects(
    throttled.findCurrent('workspace-1', '987654321'),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_ADMIN_RATE_LIMITED');
      return true;
    },
  );

  const missing = createShopifyProductUpdateRepository(async () => ({
    data: { data: { product: null } }, status: 200, requestId: null,
  }));
  await assert.rejects(
    missing.findCurrent('workspace-1', '987654321'),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyProductPublishError);
      assert.equal(error.code, 'SHOPIFY_PRODUCT_NOT_FOUND');
      return true;
    },
  );
});
