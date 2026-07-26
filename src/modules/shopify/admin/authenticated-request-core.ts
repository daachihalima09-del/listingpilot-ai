import {
  ShopifyAdminApiError,
} from './errors.ts';
import type {
  ShopifyAdminApiRequester,
  ShopifyAdminRequest,
  ShopifyAdminResponse,
} from './admin-api-client-core.ts';

export interface ShopifyAdminCredential {
  shopDomain: string;
  accessTokenEncrypted: string;
}

export interface ShopifyAdminCredentialStore {
  findConnectedByWorkspaceId(
    workspaceId: string,
  ): Promise<ShopifyAdminCredential | null>;
}

export async function performAuthenticatedShopifyRequest(
  dependencies: {
    credentials: ShopifyAdminCredentialStore;
    decryptToken(encryptedToken: string): string;
    createRequester(input: {
      shopDomain: string;
      accessToken: string;
    }): ShopifyAdminApiRequester;
  },
  input: {
    workspaceId: string;
    request: ShopifyAdminRequest;
  },
): Promise<ShopifyAdminResponse> {
  const credential = await dependencies.credentials
    .findConnectedByWorkspaceId(input.workspaceId);
  if (!credential) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_STORE_NOT_CONNECTED',
      message: 'This workspace does not have a connected Shopify store.',
    });
  }

  let accessToken: string;
  try {
    accessToken = dependencies.decryptToken(
      credential.accessTokenEncrypted,
    );
  } catch (error) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_UNAUTHORIZED',
      message: 'The stored Shopify credentials could not be used.',
      cause: error,
    });
  }
  if (!accessToken) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_UNAUTHORIZED',
      message: 'The stored Shopify credentials could not be used.',
    });
  }

  return dependencies.createRequester({
    shopDomain: credential.shopDomain,
    accessToken,
  }).request(input.request);
}
