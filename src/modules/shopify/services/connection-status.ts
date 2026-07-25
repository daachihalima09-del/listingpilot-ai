export interface ShopifyConnectionStatusRecord {
  status: 'PENDING' | 'CONNECTED' | 'ACTIVE' | 'DISCONNECTED' | 'REVOKED';
  shopDomain: string;
  shopName: string | null;
  grantedScopes: string[];
  installedAt: Date | null;
  lastVerifiedAt: Date | null;
  disconnectedAt: Date | null;
}

export interface ShopifyConnectionStatusStore {
  findByWorkspaceId(
    workspaceId: string,
  ): Promise<ShopifyConnectionStatusRecord | null>;
}

export interface ShopifyConnectionStatusDto {
  status: ShopifyConnectionStatusRecord['status'] | 'NOT_CONNECTED';
  shopDomain: string | null;
  shopName: string | null;
  grantedScopes: string[];
  installedAt: string | null;
  lastVerifiedAt: string | null;
  disconnectedAt: string | null;
  canManage: boolean;
}

export async function getShopifyConnectionStatus(
  store: ShopifyConnectionStatusStore,
  input: {
    workspaceId: string;
    role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  },
): Promise<ShopifyConnectionStatusDto> {
  const connection = await store.findByWorkspaceId(input.workspaceId);
  if (!connection) {
    return {
      status: 'NOT_CONNECTED',
      shopDomain: null,
      shopName: null,
      grantedScopes: [],
      installedAt: null,
      lastVerifiedAt: null,
      disconnectedAt: null,
      canManage: input.role === 'OWNER',
    };
  }

  return {
    status: connection.status,
    shopDomain: connection.shopDomain,
    shopName: connection.shopName,
    grantedScopes: [...connection.grantedScopes],
    installedAt: connection.installedAt?.toISOString() ?? null,
    lastVerifiedAt: connection.lastVerifiedAt?.toISOString() ?? null,
    disconnectedAt: connection.disconnectedAt?.toISOString() ?? null,
    canManage: input.role === 'OWNER',
  };
}
