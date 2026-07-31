import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { publishApprovedReview } from '@/modules/shopify/review/review-service.server';
import { reviewErrorResponse } from '@/modules/shopify/review/review-route-helpers.server';

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; reviewId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, reviewId } = await context.params;
    return NextResponse.json(await publishApprovedReview(user.id, projectId, reviewId));
  } catch (error) {
    return reviewErrorResponse(error);
  }
}

