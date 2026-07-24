import assert from 'node:assert/strict';
import test from 'node:test';
import { DuplicateEmailRegistrationError } from '../types/errors.ts';
import {
  registerMerchantWithDatabase,
  type RegistrationDatabase,
  type RegistrationTransaction,
} from './registration.ts';

const registrationInput = {
  fullName: 'Alex Morgan',
  email: 'alex@example.com',
  password: 'Secure123',
  passwordConfirmation: 'Secure123',
};

test('registration creates the tenant records and audit event in one transaction', async () => {
  const operations: Array<{ model: string; data: Record<string, unknown> }> = [];
  let transactionCount = 0;
  const record = (model: string, id: string) => async (
    args: { data: Record<string, unknown> },
  ) => {
    operations.push({ model, data: args.data });
    return { id };
  };
  const transaction: RegistrationTransaction = {
    user: { create: record('user', 'user-id') },
    organization: { create: record('organization', 'organization-id') },
    membership: { create: record('membership', 'membership-id') },
    workspace: { create: record('workspace', 'workspace-id') },
    auditLog: { create: record('auditLog', 'audit-id') },
  };
  const database: RegistrationDatabase = {
    async $transaction(operation) {
      transactionCount += 1;
      return operation(transaction);
    },
  };

  const result = await registerMerchantWithDatabase(
    database,
    registrationInput,
    'argon2id-hash',
    'fixedsuffix',
  );

  assert.equal(transactionCount, 1);
  assert.deepEqual(
    operations.map(({ model }) => model),
    ['user', 'organization', 'membership', 'workspace', 'auditLog'],
  );
  assert.deepEqual(operations[0]?.data, {
    email: 'alex@example.com',
    name: 'Alex Morgan',
    passwordHash: 'argon2id-hash',
  });
  assert.deepEqual(operations[2]?.data, {
    userId: 'user-id',
    organizationId: 'organization-id',
    role: 'OWNER',
  });
  assert.equal(operations[3]?.data.name, 'My Workspace');
  assert.equal(operations[4]?.data.action, 'user.registered');
  assert.deepEqual(result, {
    userId: 'user-id',
    organizationId: 'organization-id',
    workspaceId: 'workspace-id',
  });
});

test('duplicate email constraints become a user-friendly registration error', async () => {
  const database: RegistrationDatabase = {
    async $transaction() {
      throw {
        code: 'P2002',
        meta: { target: ['email'] },
      };
    },
  };

  await assert.rejects(
    registerMerchantWithDatabase(
      database,
      registrationInput,
      'argon2id-hash',
      'fixedsuffix',
    ),
    DuplicateEmailRegistrationError,
  );
});
