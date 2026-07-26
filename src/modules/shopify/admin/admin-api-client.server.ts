import 'server-only';

import { getShopifyConfig } from '../config';
import { decryptShopifyAccessToken } from '../crypto/token-encryption.server';
import { prismaShopifyAdminCredentialStore } from '../repositories/prisma-admin-credential-store';
import {
  createShopifyAdminApiClient,
  type ShopifyAdminRequest,
} from './admin-api-client-core';
import { performAuthenticatedShopifyRequest } from './authenticated-request-core';

export function requestShopifyAdminApi(
  workspaceId: string,
  request: ShopifyAdminRequest,
) {
  const config = getShopifyConfig();
  return performAuthenticatedShopifyRequest({
    credentials: prismaShopifyAdminCredentialStore,
    decryptToken: (encryptedToken) => decryptShopifyAccessToken(
      encryptedToken,
      config.tokenEncryptionKey,
    ),
    createRequester: ({ shopDomain, accessToken }) => (
      createShopifyAdminApiClient({
        shopDomain,
        accessToken,
        apiVersion: config.apiVersion,
      })
    ),
  }, {
    workspaceId,
    request,
  });
}
