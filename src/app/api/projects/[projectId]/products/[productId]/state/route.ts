import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { saveUserProductState } from '@/modules/products/services/product-service.server';
import {
  bindProductIdentity,
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/products/server/route-helpers';

interface Context { params: Promise<{ projectId: string; productId: string }> }

export async function PATCH(request: Request, context: Context): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedProjectResponse();
  try {
    const { projectId, productId } = await context.params;
    const body = await readProjectRequestBody(request);
    const product = await saveUserProductState(user.id, bindProductIdentity(body, projectId, productId));
    return NextResponse.json({ product });
  } catch (error) {
    return projectRouteErrorResponse(error);
  }
}
