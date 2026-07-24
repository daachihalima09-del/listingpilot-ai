import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('Prisma schema retains the tenant and Auth.js uniqueness contracts', async () => {
  const schema = await readFile(
    path.join(process.cwd(), 'prisma', 'schema.prisma'),
    'utf8',
  );

  assert.match(schema, /email\s+String\s+@unique/);
  assert.match(schema, /passwordHash\s+String\?\s+@map\("password_hash"\)/);
  assert.match(schema, /slug\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[organizationId, slug\]\)/);
  assert.match(schema, /@@unique\(\[userId, organizationId\]\)/);
  assert.match(schema, /@@unique\(\[provider, providerAccountId\]\)/);
  assert.match(schema, /sessionToken\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[identifier, token\]\)/);
});
