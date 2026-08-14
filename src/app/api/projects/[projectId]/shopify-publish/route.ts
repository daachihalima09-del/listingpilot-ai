import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getSafePublishingPlan, saveSafePublishingReview } from '@/modules/shopify/safe-publishing/safe-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const planId = new URL(request.url).searchParams.get('planId') ?? undefined;
    return NextResponse.json(await getSafePublishingPlan(user.id, (await context.params).projectId, planId));
  } catch (error) { return safePublishingErrorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    return NextResponse.json(await saveSafePublishingReview(user.id, (await context.params).projectId, await readBoundedJsonRequest(request, 32 * 1024)));
  } catch (error) { return safePublishingErrorResponse(error); }
}
