import { randomUUID } from 'node:crypto';
import { DuplicateEmailRegistrationError } from '../types/errors.ts';
import type { ValidatedSignUpInput } from '../validators/credentials.ts';

interface CreatedRecord {
  id: string;
}

export interface RegistrationTransaction {
  user: {
    create(args: {
      data: {
        email: string;
        name: string;
        passwordHash: string;
      };
    }): Promise<CreatedRecord>;
  };
  organization: {
    create(args: {
      data: {
        name: string;
        slug: string;
      };
    }): Promise<CreatedRecord>;
  };
  membership: {
    create(args: {
      data: {
        userId: string;
        organizationId: string;
        role: 'OWNER';
      };
    }): Promise<CreatedRecord>;
  };
  workspace: {
    create(args: {
      data: {
        organizationId: string;
        name: string;
        slug: string;
      };
    }): Promise<CreatedRecord>;
  };
  auditLog: {
    create(args: {
      data: {
        organizationId: string;
        workspaceId: string;
        userId: string;
        action: 'user.registered';
        entityType: 'User';
        entityId: string;
      };
    }): Promise<CreatedRecord>;
  };
}

export interface RegistrationDatabase {
  $transaction<T>(
    operation: (transaction: RegistrationTransaction) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T>;
}

export interface RegistrationResult {
  userId: string;
  organizationId: string;
  workspaceId: string;
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'organization';
}

export function createOrganizationIdentity(
  fullName: string,
  uniqueSuffix = randomUUID().replaceAll('-', '').slice(0, 12),
) {
  const firstName = fullName.trim().split(/\s+/)[0] || 'Merchant';
  const name = `${firstName}'s Organization`;

  return {
    name,
    slug: `${slugify(name)}-${uniqueSuffix}`.slice(0, 100),
  };
}

function isEmailUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') {
    return false;
  }

  const target = 'meta' in error
    && error.meta
    && typeof error.meta === 'object'
    && 'target' in error.meta
      ? error.meta.target
      : undefined;

  return Array.isArray(target)
    ? target.some((field) => String(field).includes('email'))
    : String(target ?? '').includes('email');
}

export async function registerMerchantWithDatabase(
  database: RegistrationDatabase,
  input: ValidatedSignUpInput,
  passwordHash: string,
  uniqueSuffix?: string,
): Promise<RegistrationResult> {
  const organizationIdentity = createOrganizationIdentity(input.fullName, uniqueSuffix);

  try {
    return await database.$transaction(
      async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: input.email,
            name: input.fullName,
            passwordHash,
          },
        });
        const organization = await transaction.organization.create({
          data: organizationIdentity,
        });
        await transaction.membership.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: 'OWNER',
          },
        });
        const workspace = await transaction.workspace.create({
          data: {
            organizationId: organization.id,
            name: 'My Workspace',
            slug: 'my-workspace',
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            workspaceId: workspace.id,
            userId: user.id,
            action: 'user.registered',
            entityType: 'User',
            entityId: user.id,
          },
        });

        return {
          userId: user.id,
          organizationId: organization.id,
          workspaceId: workspace.id,
        };
      },
      {
        maxWait: 30_000,
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (isEmailUniqueConstraintError(error)) {
      throw new DuplicateEmailRegistrationError({ cause: error });
    }
    throw error;
  }
}
