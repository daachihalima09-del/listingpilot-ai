import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  createUserShopifyProduct,
} from '@/modules/shopify/products/product-operations.server';
import {
  readShopifyProductCreateBody,
  shopifyProductRouteErrorResponse,
  unauthenticatedShopifyProductResponse,
} from '@/modules/shopify/products/product-route-helpers.server';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedShopifyProductResponse();

  try {
    const product = await createUserShopifyProduct(
      user.id,
      await readShopifyProductCreateBody(request),
    );
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    return shopifyProductRouteErrorResponse(error);
  }
}
