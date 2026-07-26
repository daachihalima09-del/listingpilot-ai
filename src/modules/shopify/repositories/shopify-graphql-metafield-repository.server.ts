import 'server-only';

import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import {
  createShopifyGraphqlMetafieldRepository,
} from '../metafields/graphql-metafield-repository';

export const shopifyGraphqlMetafieldRepository =
  createShopifyGraphqlMetafieldRepository(requestShopifyAdminApi);

