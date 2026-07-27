export interface ShopifyLaunchWorkspace {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface ShopifyLaunchWorkspaceStore {
  listForUser(userId: string): Promise<ShopifyLaunchWorkspace[]>;
  findForUser(
    userId: string,
    workspaceId: string,
  ): Promise<ShopifyLaunchWorkspace | null>;
}

export interface ShopifyLaunchWorkspaceOptions {
  ownerWorkspaces: ShopifyLaunchWorkspace[];
  viewOnlyWorkspaces: ShopifyLaunchWorkspace[];
  automaticallySelectedWorkspaceId: string | null;
}

export async function getShopifyLaunchWorkspaceOptions(
  store: ShopifyLaunchWorkspaceStore,
  userId: string,
): Promise<ShopifyLaunchWorkspaceOptions> {
  const workspaces = await store.listForUser(userId);
  const ownerWorkspaces = workspaces.filter(({ role }) => role === 'OWNER');
  return {
    ownerWorkspaces,
    viewOnlyWorkspaces: workspaces.filter(({ role }) => role !== 'OWNER'),
    automaticallySelectedWorkspaceId:
      ownerWorkspaces.length === 1 ? ownerWorkspaces[0].id : null,
  };
}
