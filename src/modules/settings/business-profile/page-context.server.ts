import 'server-only';

import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import {
  getTenantContextForUser,
  TenantAccessError,
} from '@/modules/tenancy/server/tenant-context';

export interface BusinessProfileSettingsSearchParams {
  workspaceId?: string | string[];
}

export async function resolveBusinessProfileSettingsTenant(
  searchParams: Promise<BusinessProfileSettingsSearchParams>,
) {
  const user = await requireAuthenticatedUser();
  const parameters = await searchParams;
  const workspaceId = typeof parameters.workspaceId === 'string'
    ? parameters.workspaceId
    : undefined;

  try {
    const tenant = await getTenantContextForUser(
      user.id,
      workspaceId ? { workspaceId } : {},
    );
    if (!tenant.workspace) notFound();
    return { user, tenant, workspace: tenant.workspace };
  } catch (error) {
    if (error instanceof TenantAccessError) notFound();
    throw error;
  }
}
