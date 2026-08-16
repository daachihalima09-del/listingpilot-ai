import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { updateBulkPublishingItem } from '@/modules/shopify/bulk-publishing/bulk-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; batchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId, batchId } = await context.params;
    return NextResponse.json(await updateBulkPublishingItem(user.id, projectId, batchId, await readBoundedJsonRequest(request, 8 * 1024)));
  } catch (error) { return safePublishingErrorResponse(error); }
}
