import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  runUserPublicationCoordinator,
} from '@/modules/shopify/coordinator/coordinator-operations.server';
import {
  coordinatorErrorResponse,
  unauthenticatedCoordinatorResponse,
} from '@/modules/shopify/coordinator/coordinator-route-helpers.server';

interface RouteContext { params: Promise<{ projectId: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedCoordinatorResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      coordinator: await runUserPublicationCoordinator(
        user.id,
        projectId,
        'MANUAL_RETRY',
      ),
    });
  } catch (error) {
    return coordinatorErrorResponse(error);
  }
}
