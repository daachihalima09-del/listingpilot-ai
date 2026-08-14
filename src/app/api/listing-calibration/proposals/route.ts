import { NextResponse } from 'next/server';
import { calibrationRouteErrorResponse, queryObject } from '@/modules/listing-calibration/application/route-helpers.server';
import { resolveCalibrationRequestAccess } from '@/modules/listing-calibration/application/request-access.server';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { proposalListQuerySchema } from '@/modules/listing-calibration/validation/request-schema';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const input = proposalListQuerySchema.parse(queryObject(request));
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ proposals: await serverListingCalibrationService.listProposals(access, input.workspaceId, input.status) });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}
