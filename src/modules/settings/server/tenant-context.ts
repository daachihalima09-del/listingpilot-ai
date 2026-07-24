import 'server-only';

import { prisma } from '@/lib/prisma';
import { SettingsForbiddenError, SettingsNotFoundError } from '../types/errors';
import {
  tenantSelectionSchema,
  type TenantSelection,
} from '../validators/settings';

export interface TenantContext {
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
  };
  workspace: {
    id: string;
    organizationId: string;
    name: string;
    createdAt: Date;
  } | null;
}

export async function getTenantContextForUser(
  userId: string,
  untrustedSelection: TenantSelection = {},
): Promise<TenantContext> {
  const selectionResult = tenantSelectionSchema.safeParse(untrustedSelection);
  if (!selectionResult.success) {
    throw new SettingsNotFoundError('The requested tenant selection is invalid.');
  }

  const selection = selectionResult.data;
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      ...(selection.organizationId
        ? { organizationId: selection.organizationId }
        : {}),
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          workspaces: {
            where: selection.workspaceId
              ? { id: selection.workspaceId }
              : undefined,
            orderBy: [
              { createdAt: 'asc' },
              { id: 'asc' },
            ],
            take: 1,
            select: {
              id: true,
              organizationId: true,
              name: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new SettingsForbiddenError();
  }

  const workspace = membership.organization.workspaces[0] ?? null;
  if (selection.workspaceId && !workspace) {
    throw new SettingsForbiddenError();
  }

  return {
    role: membership.role,
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      createdAt: membership.organization.createdAt,
    },
    workspace,
  };
}
