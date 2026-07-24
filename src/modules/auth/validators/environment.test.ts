import assert from 'node:assert/strict';
import test from 'node:test';
import { parseServerEnv } from './environment.ts';

const validEnvironment = {
  DATABASE_URL: 'postgresql://listingpilot:password@localhost:5432/listingpilot',
  AUTH_SECRET: 'a-production-length-auth-secret-value',
  AUTH_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};

test('parseServerEnv accepts the required authentication environment', () => {
  const environment = parseServerEnv(validEnvironment);

  assert.equal(environment.NODE_ENV, 'test');
  assert.equal(environment.AUTH_URL, 'http://localhost:3000');
});

test('parseServerEnv treats an empty AUTH_URL as optional', () => {
  const environment = parseServerEnv({
    ...validEnvironment,
    AUTH_URL: '',
  });

  assert.equal(environment.AUTH_URL, undefined);
});

test('parseServerEnv rejects missing or unsafe required values without echoing them', () => {
  assert.throws(
    () => parseServerEnv({
      DATABASE_URL: 'https://database.example.com',
      AUTH_SECRET: 'short-secret',
      NODE_ENV: 'production',
    }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /AUTH_SECRET/);
      assert.doesNotMatch(error.message, /short-secret/);
      return true;
    },
  );
});
