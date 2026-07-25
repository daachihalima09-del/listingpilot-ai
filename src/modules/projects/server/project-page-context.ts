import 'server-only';

import {
  getTenantContextForUser,
  TenantAccessError,
  type TenantContext,
} from '@/modules/tenancy/server/tenant-context';

export interface ProjectPageTenantContext extends TenantContext {
  workspace: NonNullable<TenantContext['workspace']>;
}

export async function getProjectPageTenantContext(
  userId: string,
  query: {
    organizationId?: string | string[];
    workspaceId?: string | string[];
  },
): Promise<ProjectPageTenantContext> {
  const organizationId = typeof query.organizationId === 'string'
    ? query.organizationId
    : undefined;
  const workspaceId = typeof query.workspaceId === 'string'
    ? query.workspaceId
    : undefined;
  const tenant = await getTenantContextForUser(userId, {
    organizationId,
    workspaceId,
  });

  if (!tenant.workspace) {
    throw new TenantAccessError('unavailable');
  }

  return {
    ...tenant,
    workspace: tenant.workspace,
  };
}

export function projectTenantQuery(
  tenant: ProjectPageTenantContext,
): string {
  return new URLSearchParams({
    organizationId: tenant.organization.id,
    workspaceId: tenant.workspace.id,
  }).toString();
}
