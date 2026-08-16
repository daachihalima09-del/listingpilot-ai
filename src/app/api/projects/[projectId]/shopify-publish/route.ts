import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getSafePublishingPlan, saveSafePublishingReview } from '@/modules/shopify/safe-publishing/safe-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

type Context = { params: Promise<{ projectId: string; productId?: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const planId = new URL(request.url).searchParams.get('planId') ?? undefined;
    const { projectId, productId } = await context.params;
    return NextResponse.json(await getSafePublishingPlan(user.id, productId ?? projectId, planId, productId ? projectId : undefined));
  } catch (error) { return safePublishingErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, productId } = await context.params;
    return NextResponse.json(await saveSafePublishingReview(user.id, productId ?? projectId, await readBoundedJsonRequest(request, 32 * 1024), productId ? projectId : undefined));
  } catch (error) { return safePublishingErrorResponse(error); }
}
