import 'server-only';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const projectRouteIdentitySchema = z.object({
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
}).strict();

export async function isProjectPageAvailableToUser(
  userId: string,
  untrustedIdentity: {
    projectId: string;
    workspaceId?: string;
  },
): Promise<boolean> {
  const result = projectRouteIdentitySchema.safeParse(untrustedIdentity);
  if (!result.success) {
    return false;
  }

  const project = await prisma.project.findFirst({
    where: {
      id: result.data.projectId,
      ...(result.data.workspaceId
        ? { workspaceId: result.data.workspaceId }
        : {}),
      workspace: {
        organization: {
          memberships: {
            some: {
              userId,
            },
          },
        },
      },
    },
    select: {
      id: true,
    },
  });
  return Boolean(project);
}
