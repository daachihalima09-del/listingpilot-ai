import 'server-only';

import { SettingsForbiddenError, SettingsNotFoundError } from '../types/errors';
import {
  getTenantContextForUser as getSharedTenantContextForUser,
  TenantAccessError,
  type TenantContext,
  type TenantSelection,
} from '@/modules/tenancy/server/tenant-context';

export type { TenantContext };

export async function getTenantContextForUser(
  userId: string,
  untrustedSelection: TenantSelection = {},
): Promise<TenantContext> {
  try {
    return await getSharedTenantContextForUser(userId, untrustedSelection);
  } catch (error) {
    if (error instanceof TenantAccessError) {
      if (error.reason === 'invalid-selection') {
        throw new SettingsNotFoundError('The requested tenant selection is invalid.');
      }
      throw new SettingsForbiddenError();
    }
    throw error;
  }
}
