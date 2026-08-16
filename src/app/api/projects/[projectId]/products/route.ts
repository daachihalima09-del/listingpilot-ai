import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  createUserProduct,
  listUserProducts,
} from '@/modules/products/services/product-service.server';
import {
  bindProductIdentity,
  productCreatedResponse,
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/products/server/route-helpers';

interface Context { params: Promise<{ projectId: string }> }

export async function GET(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const products = await listUserProducts(user.id, {
      projectId,
      workspaceId: url.searchParams.get('workspaceId'),
      archived: url.searchParams.get('archived') === 'true',
    });
    return NextResponse.json({ products });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}

export async function POST(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId } = await context.params;
    const body = await readProjectRequestBody(request);
    return productCreatedResponse(await createUserProduct(user.id, bindProductIdentity(body, projectId)));
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
