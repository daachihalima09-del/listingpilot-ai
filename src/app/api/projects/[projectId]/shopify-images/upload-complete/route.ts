import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  completeUserShopifyImageUpload,
} from '@/modules/shopify/images/image-operations.server';
import {
  readImageUpload,
  shopifyImageErrorResponse,
  unauthenticatedImageResponse,
} from '@/modules/shopify/images/image-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId } = await context.params;
    const { uploadId, file } = await readImageUpload(request);
    return NextResponse.json({
      configuration: await completeUserShopifyImageUpload(
        user.id,
        projectId,
        uploadId,
        file,
      ),
    }, { status: 201 });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}
