import {
  ShopifyForbiddenError,
  ShopifyUnauthenticatedError,
} from '../types/errors.ts';

export interface ShopifyOwnerAuthorizationStore {
  isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean>;
}

export interface ShopifyConnectTenant {
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  organization: { id: string };
  workspace: { id: string; organizationId: string } | null;
}

export interface ShopifyConnectTenantResolver {
  findForUser(
    userId: string,
    selection: { organizationId?: string; workspaceId?: string },
  ): Promise<ShopifyConnectTenant>;
}

export async function resolveShopifyConnectTenant(
  resolver: ShopifyConnectTenantResolver,
  actorUserId: string,
  selection: { organizationId?: string; workspaceId?: string },
): Promise<ShopifyConnectTenant & { workspace: NonNullable<ShopifyConnectTenant['workspace']> }> {
  let tenant: ShopifyConnectTenant;
  try {
    tenant = await resolver.findForUser(actorUserId, selection);
  } catch {
    throw new ShopifyForbiddenError();
  }
  if (tenant.role !== 'OWNER' || !tenant.workspace) {
    throw new ShopifyForbiddenError();
  }
  if (
    selection.organizationId
    && tenant.organization.id !== selection.organizationId
  ) {
    throw new ShopifyForbiddenError();
  }
  if (selection.workspaceId && tenant.workspace.id !== selection.workspaceId) {
    throw new ShopifyForbiddenError();
  }
  if (tenant.workspace.organizationId !== tenant.organization.id) {
    throw new ShopifyForbiddenError();
  }
  return {
    ...tenant,
    workspace: tenant.workspace,
  };
}

export async function requireShopifyConnectionOwner(
  store: ShopifyOwnerAuthorizationStore,
  actorUserId: string | null,
  workspaceId: string,
): Promise<void> {
  if (!actorUserId) {
    throw new ShopifyUnauthenticatedError();
  }

  if (!await store.isWorkspaceOwner(actorUserId, workspaceId)) {
    throw new ShopifyForbiddenError();
  }
}
