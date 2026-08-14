import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { executeSafePublishingPlan } from '@/modules/shopify/safe-publishing/safe-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    return NextResponse.json(await executeSafePublishingPlan(user.id, (await context.params).projectId, await readBoundedJsonRequest(request, 32 * 1024)));
  } catch (error) { return safePublishingErrorResponse(error); }
}
