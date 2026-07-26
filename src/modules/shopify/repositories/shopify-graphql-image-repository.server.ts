import 'server-only';

import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import {
  createShopifyGraphqlImageRepository,
} from '../images/graphql-image-repository';

export const shopifyGraphqlImageRepository =
  createShopifyGraphqlImageRepository(requestShopifyAdminApi);
