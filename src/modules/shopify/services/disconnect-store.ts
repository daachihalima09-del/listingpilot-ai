import { ShopifyForbiddenError } from '../types/errors.ts';

interface DisconnectStoreRecord {
  id: string;
  shopDomain: string;
  status: string;
  accessTokenEncrypted: string | null;
  disconnectedAt: Date | null;
}

export interface ShopifyDisconnectTransaction {
  shopifyStore: {
    findUnique(args: {
      where: { workspaceId: string };
      select: {
        id: true;
        shopDomain: true;
        status: true;
        accessTokenEncrypted: true;
        disconnectedAt: true;
      };
    }): Promise<DisconnectStoreRecord | null>;
    update(args: {
      where: { id: string };
      data: {
        status: 'DISCONNECTED';
        accessTokenEncrypted: null;
        disconnectedAt: Date;
      };
    }): Promise<{ id: string }>;
  };
  auditLog: {
    create(args: {
      data: {
        organizationId: string;
        workspaceId: string;
        userId: string;
        action: 'shopify.store_disconnected';
        entityType: 'ShopifyStore';
        entityId: string;
        metadata: { shopDomain: string };
      };
    }): Promise<{ id: string }>;
  };
}

export interface ShopifyDisconnectDatabase {
  $transaction<T>(
    operation: (transaction: ShopifyDisconnectTransaction) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T>;
}

export async function disconnectShopifyStore(
  database: ShopifyDisconnectDatabase,
  input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    role: string;
    disconnectedAt?: Date;
  },
): Promise<{ disconnected: boolean }> {
  if (input.role !== 'OWNER') {
    throw new ShopifyForbiddenError();
  }

  return database.$transaction(async (transaction) => {
    const store = await transaction.shopifyStore.findUnique({
      where: { workspaceId: input.workspaceId },
      select: {
        id: true,
        shopDomain: true,
        status: true,
        accessTokenEncrypted: true,
        disconnectedAt: true,
      },
    });
    if (!store) {
      return { disconnected: false };
    }
    if (
      store.status === 'DISCONNECTED'
      && store.accessTokenEncrypted === null
    ) {
      return { disconnected: true };
    }

    const disconnectedAt = input.disconnectedAt ?? new Date();
    await transaction.shopifyStore.update({
      where: { id: store.id },
      data: {
        status: 'DISCONNECTED',
        accessTokenEncrypted: null,
        disconnectedAt,
      },
    });
    await transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        action: 'shopify.store_disconnected',
        entityType: 'ShopifyStore',
        entityId: store.id,
        metadata: { shopDomain: store.shopDomain },
      },
    });
    return { disconnected: true };
  }, {
    maxWait: 30_000,
    timeout: 15_000,
  });
}
