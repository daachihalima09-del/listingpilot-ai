import 'server-only';

import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import {
  createShopifyGraphqlVariantRepository,
} from '../variants/graphql-variant-repository';

export const shopifyGraphqlVariantRepository =
  createShopifyGraphqlVariantRepository(requestShopifyAdminApi);
