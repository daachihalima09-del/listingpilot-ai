import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyAdminCredentialStore } from '../admin/authenticated-request-core';

export const prismaShopifyAdminCredentialStore: ShopifyAdminCredentialStore = {
  async findConnectedByWorkspaceId(workspaceId) {
    const store = await prisma.shopifyStore.findFirst({
      where: {
        workspaceId,
        status: 'CONNECTED',
        accessTokenEncrypted: { not: null },
      },
      select: {
        shopDomain: true,
        accessTokenEncrypted: true,
      },
    });
    if (!store?.accessTokenEncrypted) return null;
    return {
      shopDomain: store.shopDomain,
      accessTokenEncrypted: store.accessTokenEncrypted,
    };
  },
};
