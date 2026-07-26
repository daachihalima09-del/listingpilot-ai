import type {
  ShopifyAdminApiRequester,
} from '../admin/admin-api-client-core.ts';

export interface ShopifyProductService {
  readonly workspaceId: string;
  readonly adminApi: ShopifyAdminApiRequester;
}

export function createShopifyProductService(
  workspaceId: string,
  adminApi: ShopifyAdminApiRequester,
): ShopifyProductService {
  return Object.freeze({ workspaceId, adminApi });
}
