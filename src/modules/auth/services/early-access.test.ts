import assert from 'node:assert/strict';
import test from 'node:test';
import { canRegisterForEarlyAccess } from './early-access.ts';

test('production registration is closed when no early-access allowlist is configured', () => {
  assert.equal(canRegisterForEarlyAccess('merchant@example.com', {
    NODE_ENV: 'production',
  }), false);
});

test('production registration accepts only normalized allowlisted email addresses', () => {
  const environment = {
    NODE_ENV: 'production',
    EARLY_ACCESS_ALLOWED_EMAILS: ' Owner@Example.com , pilot@example.com ',
  };

  assert.equal(canRegisterForEarlyAccess('owner@example.com', environment), true);
  assert.equal(canRegisterForEarlyAccess(' PILOT@example.com ', environment), true);
  assert.equal(canRegisterForEarlyAccess('other@example.com', environment), false);
});

test('development and test registration remain available', () => {
  assert.equal(canRegisterForEarlyAccess('merchant@example.com', {
    NODE_ENV: 'development',
  }), true);
  assert.equal(canRegisterForEarlyAccess('merchant@example.com', {
    NODE_ENV: 'test',
  }), true);
});
