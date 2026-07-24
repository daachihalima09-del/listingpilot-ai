import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticateCredentials,
  type CredentialUserRepository,
} from './credentials.ts';

const activeUser = {
  id: '47a5c2cc-d75d-4b56-b3b4-50265c83051c',
  email: 'merchant@example.com',
  name: 'Merchant',
  passwordHash: 'stored-hash',
  status: 'ACTIVE' as const,
};

test('valid credentials return only safe user data', async () => {
  const repository: CredentialUserRepository = {
    findByEmail: async () => activeUser,
  };

  const user = await authenticateCredentials(
    repository,
    { email: activeUser.email, password: 'Secure123' },
    async (passwordHash, password) => (
      passwordHash === 'stored-hash' && password === 'Secure123'
    ),
    'dummy-hash',
  );

  assert.deepEqual(user, {
    id: activeUser.id,
    email: activeUser.email,
    name: activeUser.name,
    status: 'ACTIVE',
  });
  assert.equal('passwordHash' in (user ?? {}), false);
});

test('missing users and incorrect passwords return the same generic failure', async () => {
  const verificationInputs: string[] = [];
  const verify = async (passwordHash: string) => {
    verificationInputs.push(passwordHash);
    return false;
  };

  const missing = await authenticateCredentials(
    { findByEmail: async () => null },
    { email: 'missing@example.com', password: 'Secure123' },
    verify,
    'dummy-hash',
  );
  const incorrect = await authenticateCredentials(
    { findByEmail: async () => activeUser },
    { email: activeUser.email, password: 'Incorrect123' },
    verify,
    'dummy-hash',
  );

  assert.equal(missing, null);
  assert.equal(incorrect, null);
  assert.deepEqual(verificationInputs, ['dummy-hash', 'stored-hash']);
});

test('non-active users cannot authenticate even with a matching password', async () => {
  const user = await authenticateCredentials(
    {
      findByEmail: async () => ({
        ...activeUser,
        status: 'SUSPENDED',
      }),
    },
    { email: activeUser.email, password: 'Secure123' },
    async () => true,
    'dummy-hash',
  );

  assert.equal(user, null);
});
