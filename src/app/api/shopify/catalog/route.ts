import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';
import { resolveShopifyCatalogContext } from '@/modules/shopify/catalog/catalog-context.server';
import { shopifyCatalogErrorResponse } from '@/modules/shopify/catalog/catalog-route-helpers.server';
import { listShopifyCatalog } from '@/modules/shopify/catalog/catalog-service';
import { prismaCatalogLinkStore } from '@/modules/shopify/repositories/prisma-catalog-link-store';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const context = await resolveShopifyCatalogContext(user.id);
    const query = new URL(request.url).searchParams;
    const result = await listShopifyCatalog({
      requester: {
        request: (input) => requestShopifyAdminApi(context.workspace.id, input),
      },
      links: prismaCatalogLinkStore,
    }, context.workspace.id, {
      search: query.get('search') ?? '',
      status: query.get('status') || undefined,
      vendor: query.get('vendor') || undefined,
      productType: query.get('productType') || undefined,
      importState: query.get('importState') || 'ALL',
      cursor: query.get('cursor') || undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return shopifyCatalogErrorResponse(error);
  }
}

