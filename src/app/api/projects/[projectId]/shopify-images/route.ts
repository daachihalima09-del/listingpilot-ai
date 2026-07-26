import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  getUserShopifyImages,
  saveUserShopifyImages,
} from '@/modules/shopify/images/image-operations.server';
import {
  readShopifyImageJson,
  shopifyImageErrorResponse,
  unauthenticatedImageResponse,
} from '@/modules/shopify/images/image-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await getUserShopifyImages(user.id, projectId),
    });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await saveUserShopifyImages(
        user.id,
        projectId,
        await readShopifyImageJson(request),
      ),
    });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}
