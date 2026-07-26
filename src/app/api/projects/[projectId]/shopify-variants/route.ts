import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  getUserShopifyVariants,
  saveUserShopifyVariants,
} from '@/modules/shopify/variants/variant-operations.server';
import {
  readShopifyVariantConfiguration,
  shopifyVariantErrorResponse,
  unauthenticatedVariantResponse,
} from '@/modules/shopify/variants/variant-route-helpers.server';

interface ShopifyVariantsRouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(
  _request: Request,
  context: ShopifyVariantsRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedVariantResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await getUserShopifyVariants(user.id, projectId),
    });
  } catch (error) {
    return shopifyVariantErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: ShopifyVariantsRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedVariantResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await saveUserShopifyVariants(
        user.id,
        projectId,
        await readShopifyVariantConfiguration(request),
      ),
    });
  } catch (error) {
    return shopifyVariantErrorResponse(error);
  }
}
