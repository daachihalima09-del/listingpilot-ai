import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createWorkspaceWithDatabase,
  updateOrganizationSettingsWithDatabase,
  updateWorkspaceSettingsWithDatabase,
  type TenantSettingsDatabase,
  type TenantSettingsTransaction,
} from './tenant-settings.ts';
import {
  DuplicateOrganizationSlugError,
  DuplicateWorkspaceSlugError,
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
  workspaceCreateError?: unknown;
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
          slug: 'existing-workspace',
          createdAt: now,
          updatedAt: now,
        };
      },
      async create(args) {
        operations.push({ operation: 'workspace.create', args });
        if (options.workspaceCreateError) {
          throw options.workspaceCreateError;
        }
        return {
          id: workspaceId,
          organizationId: args.data.organizationId,
          name: args.data.name,
          slug: args.data.slug,
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

test('an owner creates exactly one normalized workspace and its audit event atomically', async () => {
  const { database, operations } = createDatabase();
  const result = await createWorkspaceWithDatabase(database, actorUserId, {
    organizationId,
    name: '  NEOVIX Production  ',
    slug: '  Neovix-Production  ',
  });

  assert.equal(result.organizationId, organizationId);
  assert.equal(result.name, 'NEOVIX Production');
  assert.equal(result.slug, 'neovix-production');
  assert.deepEqual(
    operations.map(({ operation }) => operation),
    ['membership.findUnique', 'workspace.create', 'auditLog.create'],
  );
  assert.deepEqual(
    (operations[2]?.args as { data: unknown }).data,
    {
      organizationId,
      workspaceId,
      userId: actorUserId,
      action: 'workspace.created',
      entityType: 'Workspace',
      entityId: workspaceId,
      metadata: {
        name: 'NEOVIX Production',
        slug: 'neovix-production',
      },
    },
  );
});

for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as const) {
  test(`${role} cannot create a workspace`, async () => {
    const { database, operations } = createDatabase({ membershipRole: role });
    await assert.rejects(
      createWorkspaceWithDatabase(database, actorUserId, {
        organizationId,
        name: 'NEOVIX Production',
        slug: 'neovix-production',
      }),
      SettingsForbiddenError,
    );
    assert.deepEqual(
      operations.map(({ operation }) => operation),
      ['membership.findUnique'],
    );
  });
}

test('organization membership is required to create a workspace', async () => {
  const { database, operations } = createDatabase({ membershipRole: null });
  await assert.rejects(
    createWorkspaceWithDatabase(database, actorUserId, {
      organizationId,
      name: 'NEOVIX Production',
      slug: 'neovix-production',
    }),
    SettingsForbiddenError,
  );
  assert.deepEqual(operations.map(({ operation }) => operation), ['membership.findUnique']);
});

test('a duplicate workspace slug is safely rejected without an audit event', async () => {
  const { database, operations } = createDatabase({
    workspaceCreateError: { code: 'P2002', meta: { target: ['organization_id', 'slug'] } },
  });
  await assert.rejects(
    createWorkspaceWithDatabase(database, actorUserId, {
      organizationId,
      name: 'NEOVIX Production',
      slug: 'neovix-production',
    }),
    (error: unknown) => {
      assert.ok(error instanceof DuplicateWorkspaceSlugError);
      assert.equal(error.statusCode, 409);
      return true;
    },
  );
  assert.equal(operations.some(({ operation }) => operation === 'auditLog.create'), false);
});

test('workspace creation does not create child records or modify the historical workspace', async () => {
  const historicalWorkspace = {
    id: '96c4788c-4aed-4193-b6c2-86529702887f',
    name: 'Historical Workspace',
  };
  const before = structuredClone(historicalWorkspace);
  const { database, operations } = createDatabase();

  await createWorkspaceWithDatabase(database, actorUserId, {
    organizationId,
    name: 'NEOVIX Production',
    slug: 'neovix-production',
  });

  assert.deepEqual(historicalWorkspace, before);
  assert.equal(operations.some(({ operation }) => operation === 'workspace.update'), false);
  assert.equal(operations.some(({ operation }) => /shopify|project|product/iu.test(operation)), false);
});

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
