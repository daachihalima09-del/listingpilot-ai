import { NextResponse } from 'next/server';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { calibrationRouteErrorResponse, queryObject } from '@/modules/listing-calibration/application/route-helpers.server';
import { resolveCalibrationRequestAccess } from '@/modules/listing-calibration/application/request-access.server';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { createFixtureRequestSchema, fixtureListQuerySchema } from '@/modules/listing-calibration/validation/request-schema';

const MAX_BODY_BYTES = 768 * 1024;

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const input = fixtureListQuerySchema.parse(queryObject(request));
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    const fixtures = await serverListingCalibrationService.listFixtures(access, input.workspaceId, input);
    return NextResponse.json({ fixtures });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = createFixtureRequestSchema.parse(await readBoundedJsonRequest(request, MAX_BODY_BYTES));
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    const fixture = await serverListingCalibrationService.createFixture(access, input);
    return NextResponse.json({ fixture }, { status: 201 });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}
