import 'server-only';

import { prisma } from '@/lib/prisma';
import { ShopifyCatalogError } from './catalog-errors';

export async function resolveShopifyCatalogContext(
  userId: string,
  ownerRequired = false,
) {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      role: true,
      organizationId: true,
      organization: {
        select: {
          workspaces: {
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            take: 1,
            select: {
              id: true,
              name: true,
              shopifyStores: {
                take: 1,
                select: {
                  id: true,
                  shopDomain: true,
                  shopName: true,
                  status: true,
                  accessTokenEncrypted: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const workspace = membership?.organization.workspaces[0];
  if (!membership || !workspace) {
    throw new ShopifyCatalogError('WORKSPACE_FORBIDDEN', 404, 'The requested catalog is unavailable.');
  }
  if (ownerRequired && membership.role !== 'OWNER') {
    throw new ShopifyCatalogError('WORKSPACE_FORBIDDEN', 403, 'Workspace owner permission is required.');
  }
  const store = workspace.shopifyStores[0];
  if (
    !store
    || !['CONNECTED', 'ACTIVE'].includes(store.status)
    || !store.accessTokenEncrypted
  ) {
    throw new ShopifyCatalogError('SHOPIFY_NOT_CONNECTED', 503, 'Connect Shopify to browse the catalog.');
  }
  return {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    workspace: { id: workspace.id, name: workspace.name },
    store: {
      id: store.id,
      shopDomain: store.shopDomain,
      shopName: store.shopName,
    },
  };
}

