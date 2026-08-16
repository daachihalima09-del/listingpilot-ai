import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { importDetectedProductImages, listProductSourceImages, rediscoverProductSourceImages } from '@/modules/product-images/product-image-service.server';
import { shopifyImageErrorResponse, unauthenticatedImageResponse } from '@/modules/shopify/images/image-route-helpers.server';

type Context = { params: Promise<{ projectId: string; productId: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId, productId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get('workspaceId') ?? '';
    return NextResponse.json({ sources: await listProductSourceImages(user.id, { workspaceId, projectId, productId }) });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId, productId } = await context.params;
    const body = await readBoundedJsonRequest(request, 16 * 1024);
    const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    return NextResponse.json(await importDetectedProductImages(user.id, { ...value, projectId, productId }));
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}

export async function PUT(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedImageResponse();
  try {
    const { projectId, productId } = await context.params;
    const body = await readBoundedJsonRequest(request, 4 * 1024);
    const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const workspaceId = 'workspaceId' in value && typeof value.workspaceId === 'string' ? value.workspaceId : '';
    return NextResponse.json({
      sources: await rediscoverProductSourceImages(user.id, { workspaceId, projectId, productId }),
    });
  } catch (error) {
    return shopifyImageErrorResponse(error);
  }
}
