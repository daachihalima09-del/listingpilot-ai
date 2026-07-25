import 'server-only';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const tenantSelectionSchema = z.object({
  organizationId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
}).strict();

export type TenantSelection = z.infer<typeof tenantSelectionSchema>;

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

export class TenantAccessError extends Error {
  readonly reason: 'invalid-selection' | 'unavailable';

  constructor(reason: 'invalid-selection' | 'unavailable') {
    super('The requested tenant context is unavailable.');
    this.name = 'TenantAccessError';
    this.reason = reason;
  }
}

export async function getTenantContextForUser(
  userId: string,
  untrustedSelection: TenantSelection = {},
): Promise<TenantContext> {
  const selectionResult = tenantSelectionSchema.safeParse(untrustedSelection);
  if (!selectionResult.success) {
    throw new TenantAccessError('invalid-selection');
  }

  const selection = selectionResult.data;
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      ...(selection.organizationId
        ? { organizationId: selection.organizationId }
        : {}),
      ...(selection.workspaceId
        ? {
            organization: {
              workspaces: {
                some: {
                  id: selection.workspaceId,
                },
              },
            },
          }
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
    throw new TenantAccessError('unavailable');
  }

  const workspace = membership.organization.workspaces[0] ?? null;
  if (selection.workspaceId && !workspace) {
    throw new TenantAccessError('unavailable');
  }

  return {
    role: membership.role,
    organization: membership.organization,
    workspace,
  };
}
