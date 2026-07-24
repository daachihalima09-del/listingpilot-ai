import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hashPassword,
  verifyPassword,
} from './password.ts';

test('passwords are hashed with Argon2id and verified securely', async () => {
  const passwordHash = await hashPassword('Secure123');

  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(passwordHash, 'Secure123'), true);
  assert.equal(await verifyPassword(passwordHash, 'Incorrect123'), false);
});

test('malformed password hashes fail closed', async () => {
  assert.equal(await verifyPassword('not-a-password-hash', 'Secure123'), false);
});
