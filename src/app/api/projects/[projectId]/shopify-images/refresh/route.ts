import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  refreshUserShopifyImages,
} from '@/modules/shopify/images/image-operations.server';
import {
  shopifyImageErrorResponse,
  unauthenticatedImageResponse,
} from '@/modules/shopify/images/image-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await refreshUserShopifyImages(user.id, projectId),
    });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}
