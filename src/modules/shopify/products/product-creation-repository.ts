import type {
  ShopifyAdminRequest,
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import type {
  ShopifyProductCreatePayload,
} from './product-payload.ts';

export interface ShopifyProductCreationRepository {
  create(
    workspaceId: string,
    payload: ShopifyProductCreatePayload,
  ): Promise<unknown>;
}

export function createShopifyProductCreationRepository(
  request: (
    workspaceId: string,
    input: ShopifyAdminRequest,
  ) => Promise<ShopifyAdminResponse>,
): ShopifyProductCreationRepository {
  return {
    async create(workspaceId, payload) {
      const response = await request(workspaceId, {
        method: 'POST',
        path: '/products.json',
        body: payload,
      });
      return response.data;
    },
  };
}
