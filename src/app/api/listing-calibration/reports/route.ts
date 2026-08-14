import { NextResponse } from 'next/server';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { calibrationRouteErrorResponse, queryObject } from '@/modules/listing-calibration/application/route-helpers.server';
import { resolveCalibrationRequestAccess } from '@/modules/listing-calibration/application/request-access.server';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { runCalibrationRequestSchema, workspaceQuerySchema } from '@/modules/listing-calibration/validation/request-schema';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const query = queryObject(request);
    const input = workspaceQuerySchema.parse(query);
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ reports: await serverListingCalibrationService.listReports(access, input.workspaceId, query.fixtureId) });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const input = runCalibrationRequestSchema.parse(await readBoundedJsonRequest(request, 32 * 1024));
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ report: await serverListingCalibrationService.runCalibration(access, input) }, { status: 201 });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}
