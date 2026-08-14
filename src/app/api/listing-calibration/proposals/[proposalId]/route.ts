import { NextResponse } from 'next/server';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { calibrationRouteErrorResponse } from '@/modules/listing-calibration/application/route-helpers.server';
import { resolveCalibrationRequestAccess } from '@/modules/listing-calibration/application/request-access.server';
import { serverListingCalibrationService } from '@/modules/listing-calibration/application/calibration-service.server';
import { reviewProposalRequestSchema } from '@/modules/listing-calibration/validation/request-schema';

interface RouteContext { params: Promise<{ proposalId: string }> }

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const input = reviewProposalRequestSchema.parse(await readBoundedJsonRequest(request, 32 * 1024));
    const { proposalId } = await context.params;
    const access = await resolveCalibrationRequestAccess(input.workspaceId);
    return NextResponse.json({ proposal: await serverListingCalibrationService.reviewProposal(access, { ...input, proposalId }) });
  } catch (error) {
    return calibrationRouteErrorResponse(error);
  }
}
