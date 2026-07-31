import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { findAuthorizedReview } from '@/modules/shopify/review/review-repository.server';
import { updateReviewDecisions } from '@/modules/shopify/review/review-service.server';
import { reviewErrorResponse } from '@/modules/shopify/review/review-route-helpers.server';

type RouteContext = {
  params: Promise<{ projectId: string; reviewId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, reviewId } = await context.params;
    const review = await findAuthorizedReview(user.id, projectId, reviewId);
    return NextResponse.json({
      id: review.id,
      version: review.version,
      status: review.status,
      comparison: review.comparisonJson,
      decisions: review.decisionsJson,
      generatedAt: review.generatedAt,
      expiresAt: review.expiresAt,
    });
  } catch (error) {
    return reviewErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, reviewId } = await context.params;
    return NextResponse.json(await updateReviewDecisions(
      user.id,
      projectId,
      reviewId,
      await readBoundedJsonRequest(request, 64 * 1024),
    ));
  } catch (error) {
    return reviewErrorResponse(error);
  }
}

