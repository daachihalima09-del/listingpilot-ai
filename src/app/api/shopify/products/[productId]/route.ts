import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  unauthenticatedShopifyProductResponse,
} from '@/modules/shopify/products/product-route-helpers.server';

export async function PATCH(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedShopifyProductResponse();
  return NextResponse.json({
    error: {
      code: 'SHOPIFY_SAFE_PUBLISHING_REQUIRED',
      message: 'Use Safe Shopify Publishing to update Shopify products.',
    },
  }, { status: 410 });
}
