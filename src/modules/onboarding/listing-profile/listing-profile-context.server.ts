import 'server-only';

import {
  getTenantContextForUser,
  TenantAccessError,
} from '@/modules/tenancy/server/tenant-context';
import { MerchantPreferenceError } from '@/modules/merchant-preferences';

export async function resolveMerchantListingProfileAccess(
  userId: string,
  workspaceId: string,
  requireOwner = false,
) {
  try {
    const tenant = await getTenantContextForUser(userId, { workspaceId });
    if (!tenant.workspace) throw new TenantAccessError('unavailable');
    if (requireOwner && tenant.role !== 'OWNER') {
      throw new MerchantPreferenceError(
        'WORKSPACE_FORBIDDEN',
        403,
        'Only the workspace owner can configure merchant profile preferences.',
      );
    }
    return {
      actorUserId: userId,
      organizationId: tenant.organization.id,
      workspaceId: tenant.workspace.id,
      workspaceName: tenant.workspace.name,
      role: tenant.role,
    } as const;
  } catch (error) {
    if (error instanceof MerchantPreferenceError) throw error;
    if (error instanceof TenantAccessError) {
      throw new MerchantPreferenceError(
        'WORKSPACE_FORBIDDEN',
        404,
        'The requested workspace is unavailable.',
      );
    }
    throw error;
  }
}
