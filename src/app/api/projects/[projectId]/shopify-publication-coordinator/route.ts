import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  getUserPublicationCoordinator,
} from '@/modules/shopify/coordinator/coordinator-operations.server';
import {
  coordinatorErrorResponse,
  unauthenticatedCoordinatorResponse,
} from '@/modules/shopify/coordinator/coordinator-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedCoordinatorResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      coordinator: await getUserPublicationCoordinator(user.id, projectId),
    });
  } catch (error) {
    return coordinatorErrorResponse(error);
  }
}
