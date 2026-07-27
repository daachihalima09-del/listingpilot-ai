import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  ShopifyLaunchWorkspace,
  ShopifyLaunchWorkspaceStore,
} from '../launch/workspace-selection';

async function listWorkspaceMemberships(
  userId: string,
  workspaceId?: string,
): Promise<ShopifyLaunchWorkspace[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      ...(workspaceId
        ? { organization: { workspaces: { some: { id: workspaceId } } } }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          workspaces: {
            where: workspaceId ? { id: workspaceId } : undefined,
            orderBy: { createdAt: 'asc' },
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  return memberships.flatMap(({ role, organization }) => (
    organization.workspaces.map((workspace) => ({
      id: workspace.id,
      organizationId: organization.id,
      name: workspace.name,
      organizationName: organization.name,
      role,
    }))
  ));
}

export const prismaShopifyLaunchWorkspaceStore: ShopifyLaunchWorkspaceStore = {
  listForUser(userId) {
    return listWorkspaceMemberships(userId);
  },
  async findForUser(userId, workspaceId) {
    return (await listWorkspaceMemberships(userId, workspaceId))[0] ?? null;
  },
};
