import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { MerchantCatalogProfileError } from '@/modules/onboarding/catalog-profile/errors';
import { resolveMerchantCatalogProfileAccess } from '@/modules/onboarding/catalog-profile/profile-context.server';
import { merchantCatalogProfileErrorResponse } from '@/modules/onboarding/catalog-profile/route-errors.server';
import { importMerchantCatalogValues } from '@/modules/onboarding/catalog-profile/shopify-import-service';
import { merchantCatalogWorkspaceSelectionSchema } from '@/modules/onboarding/catalog-profile/validation';
import { requestShopifyAdminApi } from '@/modules/shopify/admin/admin-api-client.server';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (!user || user.status !== 'ACTIVE') {
      throw new MerchantCatalogProfileError(
        'AUTH_UNAUTHENTICATED',
        401,
        'Authentication is required.',
      );
    }
    const selection = merchantCatalogWorkspaceSelectionSchema.parse({
      workspaceId: new URL(request.url).searchParams.get('workspaceId'),
    });
    const access = await resolveMerchantCatalogProfileAccess(
      user.id,
      selection.workspaceId,
      { requireOwner: true, requireShopify: true },
    );
    const values = await importMerchantCatalogValues({
      request: (input) => requestShopifyAdminApi(access.workspaceId, input),
    });
    return NextResponse.json({ values });
  } catch (error) {
    return merchantCatalogProfileErrorResponse(error);
  }
}
