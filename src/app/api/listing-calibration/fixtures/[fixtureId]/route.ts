import { NextResponse } from 'next/server';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { calibrationRouteErrorResponse, queryObject } from '@/modules/listing-calibration/application/route-helpers.server';
import { resolveCalibrationRequestAccess } from '@/modules/listing-calibration/application/request-access.server';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { duplicateFixtureRequestSchema, transitionFixtureRequestSchema, updateFixtureRequestSchema, workspaceQuerySchema } from '@/modules/listing-calibration/validation/request-schema';

const MAX_BODY_BYTES = 768 * 1024;
interface RouteContext { params: Promise<{ fixtureId: string }> }

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const input = workspaceQuerySchema.parse(queryObject(request));
    const { fixtureId } = await context.params;
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ fixture: await serverListingCalibrationService.getFixture(access, input.workspaceId, fixtureId) });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const body = await readBoundedJsonRequest(request, MAX_BODY_BYTES);
    const { fixtureId } = await context.params;
    if (typeof body === 'object' && body !== null && 'action' in body) {
      const input = transitionFixtureRequestSchema.parse(body);
      const access = await resolveCalibrationRequestAccess(input.workspaceId);
      const status = { SUBMIT: 'UNDER_REVIEW', APPROVE: 'APPROVED', REJECT: 'REJECTED', DEPRECATE: 'DEPRECATED', RETURN_TO_DRAFT: 'DRAFT' }[input.action] as 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'DEPRECATED';
      return NextResponse.json({ fixture: await serverListingCalibrationService.transitionFixture(access, { ...input, fixtureId, status }) });
    }
    const input = updateFixtureRequestSchema.parse(body);
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ fixture: await serverListingCalibrationService.updateFixture(access, { ...input, fixtureId }) });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const input = duplicateFixtureRequestSchema.parse(await readBoundedJsonRequest(request, 32 * 1024));
    const { fixtureId } = await context.params;
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ fixture: await serverListingCalibrationService.duplicateFixture(access, { ...input, fixtureId }) }, { status: 201 });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}
