import 'server-only';

import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import {
  getTenantContextForUser,
  TenantAccessError,
} from '@/modules/tenancy/server/tenant-context';
import {
  parseTenantRouteContext,
  TenantRouteContextError,
} from '@/modules/tenancy/tenant-route-context';

export interface BusinessProfileSettingsSearchParams {
  organizationId?: string | string[];
  workspaceId?: string | string[];
}

export async function resolveBusinessProfileSettingsTenant(
  searchParams: Promise<BusinessProfileSettingsSearchParams>,
) {
  const user = await requireAuthenticatedUser();
  const parameters = await searchParams;
  try {
    const tenant = await getTenantContextForUser(
      user.id,
      parseTenantRouteContext(parameters),
    );
    if (!tenant.workspace) notFound();
    return { user, tenant, workspace: tenant.workspace };
  } catch (error) {
    if (error instanceof TenantAccessError || error instanceof TenantRouteContextError) notFound();
    throw error;
  }
}
