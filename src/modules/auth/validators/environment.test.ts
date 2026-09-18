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

test('parseServerEnv requires a public HTTPS AUTH_URL in production', () => {
  for (const authUrl of [undefined, 'http://listingpilot.example.com', 'https://localhost:3000']) {
    assert.throws(
      () => parseServerEnv({
        ...validEnvironment,
        AUTH_URL: authUrl,
        NODE_ENV: 'production',
        VERCEL: '1',
      }),
      /AUTH_URL/,
    );
  }

  const environment = parseServerEnv({
    ...validEnvironment,
    AUTH_URL: 'https://listingpilot.example.com',
    NODE_ENV: 'production',
    VERCEL: '1',
  });
  assert.equal(environment.AUTH_URL, 'https://listingpilot.example.com');
});

test('parseServerEnv allows a localhost URL for a local production build', () => {
  const environment = parseServerEnv({
    ...validEnvironment,
    NODE_ENV: 'production',
    AUTH_URL: 'http://localhost:3000',
  });

  assert.equal(environment.AUTH_URL, 'http://localhost:3000');
});
