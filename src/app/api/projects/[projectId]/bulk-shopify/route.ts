import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getBulkPublishingBatch, prepareBulkPublishingBatch } from '@/modules/shopify/bulk-publishing/bulk-publishing-service.server';
import { safePublishingErrorResponse } from '@/modules/shopify/safe-publishing/safe-publishing-route';

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId } = await context.params;
    const batchId = z.string().uuid().parse(new URL(request.url).searchParams.get('batchId'));
    return NextResponse.json(await getBulkPublishingBatch(user.id, projectId, batchId));
  } catch (error) { return safePublishingErrorResponse(error); }
}

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED' } }, { status: 401 });
  try {
    const { projectId } = await context.params;
    return NextResponse.json(await prepareBulkPublishingBatch(user.id, projectId, await readBoundedJsonRequest(request, 32 * 1024)), { status: 201 });
  } catch (error) { return safePublishingErrorResponse(error); }
}
