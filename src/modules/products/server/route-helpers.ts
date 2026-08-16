import { NextResponse } from 'next/server';
import {
  projectRouteErrorResponse,
  readProjectRequestBody,
  unauthenticatedProjectResponse,
} from '@/modules/projects/server/route-helpers';

export { projectRouteErrorResponse, readProjectRequestBody, unauthenticatedProjectResponse };

export function bindProductIdentity(
  body: unknown,
  projectId: string,
  productId?: string,
): unknown {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  return { ...value, projectId, ...(productId ? { productId } : {}) };
}

export function productCreatedResponse(product: unknown): NextResponse {
  return NextResponse.json({ product }, { status: 201 });
}
