import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyAdminRequest } from '../admin/admin-api-client-core.ts';
import {
  createShopifyProductUpdateRepository,
} from './product-update-repository.ts';

test('looks up only comparison fields and sends a minimal unsafe update request', async () => {
  const requests: Array<{
    workspaceId: string;
    request: ShopifyAdminRequest;
  }> = [];
  const repository = createShopifyProductUpdateRepository(
    async (workspaceId, request) => {
      requests.push({ workspaceId, request });
      return {
        data: { product: { id: 987654321 } },
        status: 200,
        requestId: null,
        apiCallLimit: null,
      };
    },
  );

  await repository.findCurrent('workspace-1', '987654321');
  await repository.update('workspace-1', '987654321', {
    product: { id: '987654321', title: 'Updated' },
  });

  assert.equal(requests[0]?.workspaceId, 'workspace-1');
  assert.equal(requests[0]?.request.path, '/products/987654321.json');
  assert.deepEqual(
    requests[0]?.request.query?.fields,
    'id,title,handle,body_html,vendor,product_type,tags,status,updated_at',
  );
  assert.deepEqual(requests[1], {
    workspaceId: 'workspace-1',
    request: {
      method: 'PUT',
      path: '/products/987654321.json',
      body: {
        product: {
          id: '987654321',
          title: 'Updated',
        },
      },
    },
  });
});
