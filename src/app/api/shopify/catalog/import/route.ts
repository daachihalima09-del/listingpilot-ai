import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';
import { resolveShopifyCatalogContext } from '@/modules/shopify/catalog/catalog-context.server';
import { shopifyCatalogErrorResponse } from '@/modules/shopify/catalog/catalog-route-helpers.server';
import { importShopifyProduct } from '@/modules/shopify/catalog/import-service';
import { prismaShopifyImportRepository } from '@/modules/shopify/repositories/prisma-product-import-repository';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const context = await resolveShopifyCatalogContext(user.id, true);
    const result = await importShopifyProduct({
      requester: {
        request: (input) => requestShopifyAdminApi(context.workspace.id, input),
      },
      repository: prismaShopifyImportRepository,
    }, {
      actorUserId: user.id,
      organizationId: context.organizationId,
      workspaceId: context.workspace.id,
      shopifyStoreId: context.store.id,
      shopDomain: context.store.shopDomain,
      role: context.role,
    }, await readBoundedJsonRequest(request, 4096));
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return shopifyCatalogErrorResponse(error);
  }
}

