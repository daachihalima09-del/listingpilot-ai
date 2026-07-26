import 'server-only';

import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import { createShopifyProductService } from './product-service';

export function createShopifyProductServiceForWorkspace(
  workspaceId: string,
) {
  return createShopifyProductService(workspaceId, {
    request: (request) => requestShopifyAdminApi(workspaceId, request),
  });
}
