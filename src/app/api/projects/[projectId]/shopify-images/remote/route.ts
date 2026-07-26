import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  addUserRemoteShopifyImage,
} from '@/modules/shopify/images/image-operations.server';
import {
  readShopifyImageJson,
  shopifyImageErrorResponse,
  unauthenticatedImageResponse,
} from '@/modules/shopify/images/image-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await addUserRemoteShopifyImage(
        user.id,
        projectId,
        await readShopifyImageJson(request),
      ),
    }, { status: 201 });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}
