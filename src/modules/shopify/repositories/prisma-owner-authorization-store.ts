import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyOwnerAuthorizationStore } from '../services/connect-authorization';

export const prismaShopifyOwnerAuthorizationStore: ShopifyOwnerAuthorizationStore = {
  async isWorkspaceOwner(userId, workspaceId) {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        role: 'OWNER',
        organization: {
          workspaces: {
            some: {
              id: workspaceId,
            },
          },
        },
      },
      select: {
        id: true,
      },
    });

    return membership !== null;
  },
};
