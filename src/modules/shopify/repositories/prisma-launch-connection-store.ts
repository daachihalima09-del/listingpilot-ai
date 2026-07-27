import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyLaunchConnectionStore } from '../launch/connection-assessment';

export const prismaShopifyLaunchConnectionStore: ShopifyLaunchConnectionStore = {
  findByWorkspaceId(workspaceId) {
    return prisma.shopifyStore.findUnique({
      where: { workspaceId },
      select: {
        shopDomain: true,
        status: true,
        accessTokenEncrypted: true,
        grantedScopes: true,
      },
    });
  },
  async isShopConnectedElsewhere(shopDomain, workspaceId) {
    return Boolean(await prisma.shopifyStore.findFirst({
      where: {
        shopDomain,
        workspaceId: { not: workspaceId },
      },
      select: { id: true },
    }));
  },
};

