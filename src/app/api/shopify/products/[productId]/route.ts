import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  updateUserShopifyProduct,
} from '@/modules/shopify/products/product-operations.server';
import {
  readShopifyProductUpdateBody,
  shopifyProductRouteErrorResponse,
  unauthenticatedShopifyProductResponse,
} from '@/modules/shopify/products/product-route-helpers.server';

interface ShopifyProductRouteContext {
  params: Promise<{ productId: string }>;
}

export async function PATCH(
  request: Request,
  context: ShopifyProductRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedShopifyProductResponse();

  try {
    const { productId } = await context.params;
    const result = await updateUserShopifyProduct(
      user.id,
      productId,
      await readShopifyProductUpdateBody(request),
    );
    return NextResponse.json(result);
  } catch (error) {
    return shopifyProductRouteErrorResponse(error);
  }
}
