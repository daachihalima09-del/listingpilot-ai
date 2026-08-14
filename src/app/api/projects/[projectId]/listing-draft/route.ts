import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import { generateProjectListingDraft, getProjectListingGenerationEligibility, regenerateProjectListingDraft, saveProjectListingDraft } from '@/modules/listing-draft/persistence/project-draft-service.server';
import { generateListingDraftRequestSchema, regenerateListingDraftRequestSchema, saveListingDraftRequestSchema } from '@/modules/listing-draft/persistence/request-schema';
import { listingDraftRouteErrorResponse } from '@/modules/listing-draft/persistence/route-helpers.server';
import { createListingGenerationTrace } from '@/modules/listing-draft/persistence/generation-trace.server';

const MAX_DRAFT_BODY_BYTES = 768 * 1024;

interface ListingDraftRouteContext {
  params: Promise<{ projectId: string }>;
}

function unauthenticated(): NextResponse {
  return NextResponse.json({ error: { code: 'AUTH_UNAUTHENTICATED', message: 'Authentication is required.' } }, { status: 401 });
}

export async function GET(request: Request, context: ListingDraftRouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  try {
    const { projectId } = await context.params;
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get('workspaceId'));
    const result = await getProjectListingGenerationEligibility({
      actorUserId: user.id,
      workspaceId,
      projectId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return listingDraftRouteErrorResponse(error);
  }
}

export async function POST(request: Request, context: ListingDraftRouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  let trace: ReturnType<typeof createListingGenerationTrace> | null = null;
  try {
    const { projectId } = await context.params;
    trace = createListingGenerationTrace({ requestId: crypto.randomUUID(), projectId });
    const input = generateListingDraftRequestSchema.parse(await readBoundedJsonRequest(request, MAX_DRAFT_BODY_BYTES));
    const result = await generateProjectListingDraft({
      actorUserId: user.id,
      workspaceId: input.workspaceId,
      projectId,
      version: input.version,
      signal: request.signal,
      trace,
    });
    const response = NextResponse.json({
      draft: result.draft,
      readinessData: result.readinessData,
      project: { version: result.project.version, updatedAt: result.project.updatedAt },
      requestId: trace.requestId,
    });
    response.headers.set('x-listingpilot-generation-request-id', trace.requestId);
    trace.start('response');
    trace.complete('response', { status: 200 });
    await trace.flush();
    return response;
  } catch (error) {
    trace?.fail(error);
    const response = listingDraftRouteErrorResponse(error);
    if (trace) response.headers.set('x-listingpilot-generation-request-id', trace.requestId);
    if (trace) { trace.start('response'); trace.complete('response', { status: response.status }); await trace.flush(); }
    return response;
  }
}

export async function PATCH(request: Request, context: ListingDraftRouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  try {
    const { projectId } = await context.params;
    const input = saveListingDraftRequestSchema.parse(await readBoundedJsonRequest(request, MAX_DRAFT_BODY_BYTES));
    const result = await saveProjectListingDraft({ actorUserId: user.id, projectId, ...input });
    return NextResponse.json({
      draft: result.draft,
      project: { version: result.project.version, updatedAt: result.project.updatedAt },
    });
  } catch (error) {
    return listingDraftRouteErrorResponse(error);
  }
}

export async function PUT(request: Request, context: ListingDraftRouteContext): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticated();
  try {
    const { projectId } = await context.params;
    const input = regenerateListingDraftRequestSchema.parse(await readBoundedJsonRequest(request, MAX_DRAFT_BODY_BYTES));
    const result = await regenerateProjectListingDraft({
      actorUserId: user.id,
      projectId,
      signal: request.signal,
      ...input,
    });
    return NextResponse.json({
      draft: result.draft,
      project: { version: result.project.version, updatedAt: result.project.updatedAt },
    });
  } catch (error) {
    return listingDraftRouteErrorResponse(error);
  }
}
