import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { prepareSafePublishingPlan } from '@/modules/shopify/safe-publishing/safe-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

export async function POST(request: Request, context: { params: Promise<{ projectId: string; productId?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, productId } = await context.params;
    return NextResponse.json(await prepareSafePublishingPlan(user.id, productId ?? projectId, await readBoundedJsonRequest(request, 4 * 1024), productId ? projectId : undefined), { status: 201 });
  } catch (error) { return safePublishingErrorResponse(error); }
}
