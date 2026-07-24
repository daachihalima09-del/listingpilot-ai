import assert from 'node:assert/strict';
import test from 'node:test';
import {
  updateOrganizationSettingsWithDatabase,
  updateWorkspaceSettingsWithDatabase,
  type TenantSettingsDatabase,
  type TenantSettingsTransaction,
} from './tenant-settings.ts';
import {
  DuplicateOrganizationSlugError,
  SettingsForbiddenError,
} from '../types/errors.ts';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const organizationId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-07-24T00:00:00.000Z');

interface DatabaseOptions {
  membershipRole?: string | null;
  workspaceExists?: boolean;
  organizationUpdateError?: unknown;
}

function createDatabase(options: DatabaseOptions = {}) {
  const operations: Array<{ operation: string; args: unknown }> = [];
  const membershipRole = options.membershipRole === undefined
    ? 'OWNER'
    : options.membershipRole;

  const transaction: TenantSettingsTransaction = {
    membership: {
      async findUnique(args) {
        operations.push({ operation: 'membership.findUnique', args });
        return membershipRole ? { role: membershipRole } : null;
      },
    },
    organization: {
      async update(args) {
        operations.push({ operation: 'organization.update', args });
        if (options.organizationUpdateError) {
          throw options.organizationUpdateError;
        }
        return {
          id: organizationId,
          name: args.data.name,
          slug: args.data.slug,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    workspace: {
      async findUnique(args) {
        operations.push({ operation: 'workspace.findUnique', args });
        return options.workspaceExists === false
          ? null
          : { organizationId };
      },
      async update(args) {
        operations.push({ operation: 'workspace.update', args });
        return {
          id: workspaceId,
          organizationId,
          name: args.data.name,
          createdAt: now,
          updatedAt: now,
        };
      },
    },
    auditLog: {
      async create(args) {
        operations.push({ operation: 'auditLog.create', args });
        return { id: 'audit-id' };
      },
    },
  };

  const database: TenantSettingsDatabase = {
    async $transaction(operation) {
      return operation(transaction);
    },
  };

  return { database, operations };
}

test('an owner can update an organization and creates the audit event atomically', async () => {
  const { database, operations } = createDatabase();
  const result = await updateOrganizationSettingsWithDatabase(
    database,
    actorUserId,
    {
      organizationId,
      name: 'Updated Organization',
      slug: 'updated-organization',
    },
  );

  assert.equal(result.name, 'Updated Organization');
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    ['membership.findUnique', 'organization.update', 'auditLog.create'],
  );
  assert.deepEqual(
    (operations[2]?.args as {
      data: {
        action: string;
        entityType: string;
        organizationId: string;
        userId: string;
      };
    }).data,
    {
      organizationId,
      userId: actorUserId,
      action: 'organization.updated',
      entityType: 'Organization',
      entityId: organizationId,
      metadata: {
        changedFields: ['name', 'slug'],
      },
    },
  );
});

test('a non-owner organization update fails with 403 before writes or audit events', async () => {
  const { database, operations } = createDatabase({ membershipRole: 'MEMBER' });

  await assert.rejects(
    updateOrganizationSettingsWithDatabase(database, actorUserId, {
      organizationId,
      name: 'Unauthorized Rename',
      slug: 'unauthorized-rename',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SettingsForbiddenError);
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    ['membership.findUnique'],
  );
});

test('a duplicate organization slug returns a conflict and does not create an audit event', async () => {
  const { database, operations } = createDatabase({
    organizationUpdateError: {
      code: 'P2002',
      meta: {
        target: ['slug'],
      },
    },
  });

  await assert.rejects(
    updateOrganizationSettingsWithDatabase(database, actorUserId, {
      organizationId,
      name: 'Duplicate Organization',
      slug: 'existing-slug',
    }),
    (error: unknown) => {
      assert.ok(error instanceof DuplicateOrganizationSlugError);
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(
    operations.some(({ operation }) => operation === 'auditLog.create'),
    false,
  );
});

test('an owner can update a workspace and creates the workspace audit event', async () => {
  const { database, operations } = createDatabase();
  const result = await updateWorkspaceSettingsWithDatabase(
    database,
    actorUserId,
    {
      workspaceId,
      name: 'Updated Workspace',
    },
  );

  assert.equal(result.name, 'Updated Workspace');
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    [
      'workspace.findUnique',
      'membership.findUnique',
      'workspace.update',
      'auditLog.create',
    ],
  );
  const auditData = (operations[3]?.args as {
    data: {
      action: string;
      entityType: string;
      workspaceId: string;
    };
  }).data;
  assert.equal(auditData.action, 'workspace.updated');
  assert.equal(auditData.entityType, 'Workspace');
  assert.equal(auditData.workspaceId, workspaceId);
});

test('a non-owner workspace update fails with 403 before the update and audit event', async () => {
  const { database, operations } = createDatabase({ membershipRole: null });

  await assert.rejects(
    updateWorkspaceSettingsWithDatabase(database, actorUserId, {
      workspaceId,
      name: 'Unauthorized Workspace',
    }),
    (error: unknown) => {
      assert.ok(error instanceof SettingsForbiddenError);
      assert.equal(error.statusCode, 403);
      return true;
    },
  );
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    ['workspace.findUnique', 'membership.findUnique'],
  );
});

test('an unknown workspace returns 403 without revealing whether another tenant owns it', async () => {
  const { database, operations } = createDatabase({ workspaceExists: false });

  await assert.rejects(
    updateWorkspaceSettingsWithDatabase(database, actorUserId, {
      workspaceId,
      name: 'Unknown Workspace',
    }),
    SettingsForbiddenError,
  );
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    ['workspace.findUnique'],
  );
});
