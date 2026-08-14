import 'server-only';
import { getCurrentUser } from '../../auth/server/context.ts';
import { MerchantPreferenceError } from '../../merchant-preferences/errors.ts';
import { resolveMerchantListingProfileAccess } from '../../onboarding/listing-profile/listing-profile-context.server.ts';
import type { CalibrationAccess } from './calibration-service.ts';

export async function resolveCalibrationRequestAccess(workspaceId: string): Promise<CalibrationAccess> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') {
    throw new MerchantPreferenceError('WORKSPACE_FORBIDDEN', 401, 'Authentication is required.');
  }
  return resolveMerchantListingProfileAccess(user.id, workspaceId);
}
