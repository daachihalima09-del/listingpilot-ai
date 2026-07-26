import type {
  ShopifyAdminRequest,
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import type {
  ShopifyProductUpdatePayload,
} from './product-change-set.ts';

export interface ShopifyProductUpdateRepository {
  findCurrent(workspaceId: string, productId: string): Promise<unknown>;
  update(
    workspaceId: string,
    productId: string,
    payload: ShopifyProductUpdatePayload,
  ): Promise<unknown>;
}

export function createShopifyProductUpdateRepository(
  request: (
    workspaceId: string,
    input: ShopifyAdminRequest,
  ) => Promise<ShopifyAdminResponse>,
): ShopifyProductUpdateRepository {
  return {
    async findCurrent(workspaceId, productId) {
      const response = await request(workspaceId, {
        path: `/products/${productId}.json`,
        query: {
          fields: [
            'id',
            'title',
            'handle',
            'body_html',
            'vendor',
            'product_type',
            'tags',
            'status',
            'updated_at',
          ].join(','),
        },
      });
      return response.data;
    },
    async update(workspaceId, productId, payload) {
      const response = await request(workspaceId, {
        method: 'PUT',
        path: `/products/${productId}.json`,
        body: payload,
      });
      return response.data;
    },
  };
}
