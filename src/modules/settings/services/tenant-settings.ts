import {
  DuplicateOrganizationSlugError,
  SettingsForbiddenError,
} from '../types/errors.ts';
import {
  organizationUpdateSchema,
  workspaceUpdateSchema,
} from '../validators/settings.ts';

interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

interface WorkspaceRecord {
  id: string;
  organizationId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipRecord {
  role: string;
}

interface WorkspaceOrganizationRecord {
  organizationId: string;
}

interface AuditRecord {
  id: string;
}

export interface TenantSettingsTransaction {
  membership: {
    findUnique(args: {
      where: {
        userId_organizationId: {
          userId: string;
          organizationId: string;
        };
      };
      select: {
        role: true;
      };
    }): Promise<MembershipRecord | null>;
  };
  organization: {
    update(args: {
      where: {
        id: string;
      };
      data: {
        name: string;
        slug: string;
      };
      select: {
        id: true;
        name: true;
        slug: true;
        createdAt: true;
        updatedAt: true;
      };
    }): Promise<OrganizationRecord>;
  };
  workspace: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        organizationId: true;
      };
    }): Promise<WorkspaceOrganizationRecord | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        name: string;
      };
      select: {
        id: true;
        organizationId: true;
        name: true;
        createdAt: true;
        updatedAt: true;
      };
    }): Promise<WorkspaceRecord>;
  };
  auditLog: {
    create(args: {
      data: {
        organizationId: string;
        workspaceId?: string;
        userId: string;
        action: 'organization.updated' | 'workspace.updated';
        entityType: 'Organization' | 'Workspace';
        entityId: string;
        metadata: {
          changedFields: string[];
        };
      };
    }): Promise<AuditRecord>;
  };
}

export interface TenantSettingsDatabase {
  $transaction<T>(
    operation: (transaction: TenantSettingsTransaction) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
}

const transactionOptions = {
  maxWait: 30_000,
  timeout: 15_000,
} as const;

function requireOwner(membership: MembershipRecord | null): void {
  if (membership?.role !== 'OWNER') {
    throw new SettingsForbiddenError();
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'P2002',
  );
}

export async function updateOrganizationSettingsWithDatabase(
  database: TenantSettingsDatabase,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<OrganizationRecord> {
  const input = organizationUpdateSchema.parse(untrustedInput);

  try {
    return await database.$transaction(
      async (transaction) => {
        const membership = await transaction.membership.findUnique({
          where: {
            userId_organizationId: {
              userId: actorUserId,
              organizationId: input.organizationId,
            },
          },
          select: {
            role: true,
          },
        });
        requireOwner(membership);

        const organization = await transaction.organization.update({
          where: {
            id: input.organizationId,
          },
          data: {
            name: input.name,
            slug: input.slug,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            userId: actorUserId,
            action: 'organization.updated',
            entityType: 'Organization',
            entityId: organization.id,
            metadata: {
              changedFields: ['name', 'slug'],
            },
          },
        });

        return organization;
      },
      transactionOptions,
    );
  } catch (error) {
    // Slug is the only unique value changed by this operation. Prisma's
    // driver adapter does not consistently expose the legacy meta.target.
    if (isUniqueConstraintError(error)) {
      throw new DuplicateOrganizationSlugError({ cause: error });
    }
    throw error;
  }
}

export async function updateWorkspaceSettingsWithDatabase(
  database: TenantSettingsDatabase,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<WorkspaceRecord> {
  const input = workspaceUpdateSchema.parse(untrustedInput);

  return database.$transaction(
    async (transaction) => {
      const workspaceIdentity = await transaction.workspace.findUnique({
        where: {
          id: input.workspaceId,
        },
        select: {
          organizationId: true,
        },
      });

      if (!workspaceIdentity) {
        throw new SettingsForbiddenError();
      }

      const membership = await transaction.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: actorUserId,
            organizationId: workspaceIdentity.organizationId,
          },
        },
        select: {
          role: true,
        },
      });
      requireOwner(membership);

      const workspace = await transaction.workspace.update({
        where: {
          id: input.workspaceId,
        },
        data: {
          name: input.name,
        },
        select: {
          id: true,
          organizationId: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await transaction.auditLog.create({
        data: {
          organizationId: workspace.organizationId,
          workspaceId: workspace.id,
          userId: actorUserId,
          action: 'workspace.updated',
          entityType: 'Workspace',
          entityId: workspace.id,
          metadata: {
            changedFields: ['name'],
          },
        },
      });

      return workspace;
    },
    transactionOptions,
  );
}
