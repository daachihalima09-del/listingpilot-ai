export type ShopifyLaunchConnectionAssessment =
  | 'CONNECTED_AND_USABLE'
  | 'TOKEN_MISSING'
  | 'SCOPE_UPGRADE_REQUIRED'
  | 'SHOP_MISMATCH'
  | 'DISCONNECTED'
  | 'INVALID_CONNECTION';

export interface ShopifyLaunchConnectionRecord {
  shopDomain: string;
  status: 'PENDING' | 'CONNECTED' | 'ACTIVE' | 'DISCONNECTED' | 'REVOKED';
  accessTokenEncrypted: string | null;
  grantedScopes: string[];
}

export interface ShopifyLaunchConnectionStore {
  findByWorkspaceId(
    workspaceId: string,
  ): Promise<ShopifyLaunchConnectionRecord | null>;
  isShopConnectedElsewhere(
    shopDomain: string,
    workspaceId: string,
  ): Promise<boolean>;
}

export async function assessShopifyLaunchConnection(
  dependencies: {
    store: ShopifyLaunchConnectionStore;
    decryptToken(encrypted: string): string;
  },
  input: {
    workspaceId: string;
    shopDomain: string;
    requiredScopes: string[];
  },
): Promise<ShopifyLaunchConnectionAssessment> {
  const connection = await dependencies.store.findByWorkspaceId(
    input.workspaceId,
  );
  if (!connection) {
    return await dependencies.store.isShopConnectedElsewhere(
      input.shopDomain,
      input.workspaceId,
    )
      ? 'SHOP_MISMATCH'
      : 'TOKEN_MISSING';
  }
  if (connection.shopDomain !== input.shopDomain) {
    return 'SHOP_MISMATCH';
  }
  if (
    connection.status === 'DISCONNECTED'
    || connection.status === 'REVOKED'
  ) {
    return 'DISCONNECTED';
  }
  if (!connection.accessTokenEncrypted) {
    return 'TOKEN_MISSING';
  }

  try {
    if (!dependencies.decryptToken(connection.accessTokenEncrypted)) {
      return 'INVALID_CONNECTION';
    }
  } catch {
    return 'INVALID_CONNECTION';
  }

  const grantedScopes = new Set(connection.grantedScopes);
  if (input.requiredScopes.some((scope) => !grantedScopes.has(scope))) {
    return 'SCOPE_UPGRADE_REQUIRED';
  }
  if (!['CONNECTED', 'ACTIVE'].includes(connection.status)) {
    return 'INVALID_CONNECTION';
  }
  return 'CONNECTED_AND_USABLE';
}

