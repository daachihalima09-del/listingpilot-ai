import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyConnectionStatusStore } from '../services/connection-status';

export const prismaShopifyConnectionStatusStore: ShopifyConnectionStatusStore = {
  findByWorkspaceId(workspaceId) {
    return prisma.shopifyStore.findUnique({
      where: { workspaceId },
      select: {
        status: true,
        shopDomain: true,
        shopName: true,
        grantedScopes: true,
        installedAt: true,
        lastVerifiedAt: true,
        disconnectedAt: true,
      },
    });
  },
};
