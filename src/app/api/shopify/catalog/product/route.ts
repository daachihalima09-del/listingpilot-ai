import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';
import { resolveShopifyCatalogContext } from '@/modules/shopify/catalog/catalog-context.server';
import { shopifyCatalogErrorResponse } from '@/modules/shopify/catalog/catalog-route-helpers.server';
import { fetchShopifyCatalogProduct } from '@/modules/shopify/catalog/catalog-service';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const context = await resolveShopifyCatalogContext(user.id);
    const product = await fetchShopifyCatalogProduct({
      request: (input) => requestShopifyAdminApi(context.workspace.id, input),
    }, new URL(request.url).searchParams.get('productId') ?? '');
    return NextResponse.json({ product });
  } catch (error) {
    return shopifyCatalogErrorResponse(error);
  }
}

