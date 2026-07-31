import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  getTenantContextForUser,
  TenantAccessError,
} from '@/modules/tenancy/server/tenant-context';
import { MerchantCatalogProfileError } from './errors';

export async function resolveMerchantCatalogProfileAccess(
  userId: string,
  workspaceId: string,
  options: { requireOwner?: boolean; requireShopify?: boolean } = {},
) {
  try {
    const tenant = await getTenantContextForUser(userId, { workspaceId });
    if (!tenant.workspace) throw new TenantAccessError('unavailable');
    if (options.requireOwner && tenant.role !== 'OWNER') {
      throw new MerchantCatalogProfileError(
        'OWNER_REQUIRED',
        403,
        'Only the workspace owner can configure the catalog profile.',
      );
    }
    const store = await prisma.shopifyStore.findUnique({
      where: { workspaceId: tenant.workspace.id },
      select: {
        id: true,
        shopDomain: true,
        shopName: true,
        status: true,
        accessTokenEncrypted: true,
      },
    });
    const shopifyConnected = Boolean(
      store
      && ['CONNECTED', 'ACTIVE'].includes(store.status)
      && store.accessTokenEncrypted,
    );
    if (options.requireShopify && !shopifyConnected) {
      throw new MerchantCatalogProfileError(
        'SHOPIFY_NOT_CONNECTED',
        503,
        'Connect Shopify before importing catalog values.',
      );
    }
    return {
      actorUserId: userId,
      organizationId: tenant.organization.id,
      workspaceId: tenant.workspace.id,
      workspaceName: tenant.workspace.name,
      role: tenant.role,
      shopifyConnected,
      store: store
        ? { id: store.id, shopDomain: store.shopDomain, shopName: store.shopName }
        : null,
    };
  } catch (error) {
    if (error instanceof MerchantCatalogProfileError) throw error;
    if (error instanceof TenantAccessError) {
      throw new MerchantCatalogProfileError(
        'WORKSPACE_FORBIDDEN',
        404,
        'The requested workspace is unavailable.',
      );
    }
    throw error;
  }
}
