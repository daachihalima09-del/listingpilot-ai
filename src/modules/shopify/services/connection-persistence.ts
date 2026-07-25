import { ShopifyDuplicateShopError } from '../types/errors.ts';

export interface ShopifyStoreRecord {
  id: string;
  workspaceId: string;
  shopDomain: string;
}

interface PersistedShopifyStore extends ShopifyStoreRecord {
  status: string;
}

export interface ShopifyConnectionTransaction {
  shopifyStore: {
    findUnique(args: {
      where: { shopDomain?: string; workspaceId?: string };
      select: { id: true; workspaceId: true; shopDomain: true };
    }): Promise<ShopifyStoreRecord | null>;
    create(args: {
      data: ShopifyConnectionWrite;
      select: ShopifyStoreSelect;
    }): Promise<PersistedShopifyStore>;
    update(args: {
      where: { id: string };
      data: ShopifyConnectionWrite;
      select: ShopifyStoreSelect;
    }): Promise<PersistedShopifyStore>;
  };
  auditLog: {
    create(args: {
      data: {
        organizationId: string;
        workspaceId: string;
        userId: string;
        action: 'shopify.store_connected' | 'shopify.store_reconnected';
        entityType: 'ShopifyStore';
        entityId: string;
        metadata: {
          shopDomain: string;
          grantedScopes: string[];
        };
      };
    }): Promise<{ id: string }>;
  };
}

export interface ShopifyConnectionDatabase {
  $transaction<T>(
    operation: (transaction: ShopifyConnectionTransaction) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

interface ShopifyConnectionWrite {
  workspaceId: string;
  shopDomain: string;
  shopName: string;
  accessTokenEncrypted: string;
  requestedScopes: string[];
  grantedScopes: string[];
  status: 'CONNECTED';
  installedAt: Date;
  lastVerifiedAt: Date;
  disconnectedAt: null;
}

const shopifyStoreSelect = {
  id: true,
  workspaceId: true,
  shopDomain: true,
  status: true,
} as const;
type ShopifyStoreSelect = typeof shopifyStoreSelect;

export interface PersistShopifyConnectionInput {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  shopDomain: string;
  shopName: string;
  accessTokenEncrypted: string;
  requestedScopes: string[];
  grantedScopes: string[];
  verifiedAt: Date;
}

export async function persistShopifyConnection(
  database: ShopifyConnectionDatabase,
  input: PersistShopifyConnectionInput,
): Promise<{ store: PersistedShopifyStore; reconnected: boolean }> {
  return database.$transaction(async (transaction) => {
    const shopStore = await transaction.shopifyStore.findUnique({
      where: { shopDomain: input.shopDomain },
      select: { id: true, workspaceId: true, shopDomain: true },
    });
    if (shopStore && shopStore.workspaceId !== input.workspaceId) {
      throw new ShopifyDuplicateShopError();
    }

    const workspaceStore = await transaction.shopifyStore.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { id: true, workspaceId: true, shopDomain: true },
    });
    if (
      workspaceStore
      && shopStore
      && workspaceStore.id !== shopStore.id
    ) {
      throw new ShopifyDuplicateShopError();
    }

    const existingStore = shopStore ?? workspaceStore;
    const write: ShopifyConnectionWrite = {
      workspaceId: input.workspaceId,
      shopDomain: input.shopDomain,
      shopName: input.shopName,
      accessTokenEncrypted: input.accessTokenEncrypted,
      requestedScopes: input.requestedScopes,
      grantedScopes: input.grantedScopes,
      status: 'CONNECTED',
      installedAt: input.verifiedAt,
      lastVerifiedAt: input.verifiedAt,
      disconnectedAt: null,
    };
    const store = existingStore
      ? await transaction.shopifyStore.update({
          where: { id: existingStore.id },
          data: write,
          select: shopifyStoreSelect,
        })
      : await transaction.shopifyStore.create({
          data: write,
          select: shopifyStoreSelect,
        });

    await transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        action: existingStore
          ? 'shopify.store_reconnected'
          : 'shopify.store_connected',
        entityType: 'ShopifyStore',
        entityId: store.id,
        metadata: {
          shopDomain: input.shopDomain,
          grantedScopes: input.grantedScopes,
        },
      },
    });
    return { store, reconnected: Boolean(existingStore) };
  }, {
    maxWait: 30_000,
    timeout: 15_000,
  });
}
