import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyUninstallStore } from '../webhooks/app-uninstalled-service';

export const prismaShopifyUninstallStore: ShopifyUninstallStore = {
  disconnectByShopDomain(shopDomain, disconnectedAt) {
    return prisma.$transaction(async (transaction) => {
      const stores = await transaction.shopifyStore.findMany({
        where: {
          shopDomain,
          OR: [
            { status: { not: 'DISCONNECTED' } },
            { accessTokenEncrypted: { not: null } },
          ],
        },
        select: {
          id: true,
          workspaceId: true,
          workspace: {
            select: { organizationId: true },
          },
        },
      });
      for (const store of stores) {
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
            organizationId: store.workspace.organizationId,
            workspaceId: store.workspaceId,
            action: 'shopify.store_uninstalled',
            entityType: 'ShopifyStore',
            entityId: store.id,
            metadata: { shopDomain },
          },
        });
      }
      return { disconnected: stores.length };
    }, {
      maxWait: 30_000,
      timeout: 15_000,
    });
  },
};

