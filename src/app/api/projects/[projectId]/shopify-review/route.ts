import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { generateChangeReview } from '@/modules/shopify/review/review-service.server';
import { reviewErrorResponse } from '@/modules/shopify/review/review-route-helpers.server';

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    return NextResponse.json(
      await generateChangeReview(user.id, (await context.params).projectId),
      { status: 201 },
    );
  } catch (error) {
    return reviewErrorResponse(error);
  }
}

