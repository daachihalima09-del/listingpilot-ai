import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  deleteUserProduct,
  getUserProduct,
  renameUserProduct,
} from '@/modules/products/services/product-service.server';
import {
  bindProductIdentity,
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/products/server/route-helpers';

interface Context { params: Promise<{ projectId: string; productId: string }> }

export async function GET(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId, productId } = await context.params;
    const product = await getUserProduct(user.id, {
      projectId,
      productId,
      workspaceId: new URL(request.url).searchParams.get('workspaceId'),
    });
    return NextResponse.json({ product });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId, productId } = await context.params;
    const body = await readProjectRequestBody(request);
    const product = await renameUserProduct(user.id, bindProductIdentity(body, projectId, productId));
    return NextResponse.json({ product });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId, productId } = await context.params;
    const body = await readProjectRequestBody(request);
    await deleteUserProduct(user.id, bindProductIdentity(body, projectId, productId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
