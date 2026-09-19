import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isExpectedProductionDatabase,
  sanitizeDatabaseIdentity,
} from './database-identity.ts';

test('sanitizes pooled and direct Neon URLs without retaining credentials or query values', () => {
  const pooled = sanitizeDatabaseIdentity(
    'postgresql://private-user:private-password@ep-crimson-sun-ay0s2ifc-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&secret=value',
  );
  const direct = sanitizeDatabaseIdentity(
    'postgresql://private-user:private-password@ep-crimson-sun-ay0s2ifc.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require',
  );

  assert.deepEqual(pooled, {
    provider: 'postgresql',
    database: 'neondb',
    endpointFamily: 'crimson-sun-ay0s2ifc',
  });
  assert.deepEqual(direct, pooled);

  const serialized = JSON.stringify({ pooled, direct });
  assert.doesNotMatch(serialized, /private-user|private-password|sslmode|secret=value|neon\.tech/u);
});

test('requires both configured identity and database-native name to match production', () => {
  const expected = sanitizeDatabaseIdentity(
    'postgresql://user:password@ep-crimson-sun-ay0s2ifc-pooler.example/neondb',
  );
  const otherEndpoint = sanitizeDatabaseIdentity(
    'postgresql://user:password@ep-other-family-pooler.example/neondb',
  );
  assert.ok(expected);
  assert.ok(otherEndpoint);

  assert.equal(isExpectedProductionDatabase(expected, 'neondb'), true);
  assert.equal(isExpectedProductionDatabase(expected, 'otherdb'), false);
  assert.equal(isExpectedProductionDatabase(otherEndpoint, 'neondb'), false);
});

test('temporary route is OWNER-only, input-free, read-only, and workspace-scoped', async () => {
  const route = await readFile(
    new URL('../../app/api/internal/production-database-identity/route.ts', import.meta.url),
    'utf8',
  );

  assert.match(route, /getCurrentUser\(\)/u);
  assert.match(route, /tenant\.role !== 'OWNER'/u);
  assert.match(route, /workspaceId: tenant\.workspace\.id/u);
  assert.match(route, /current_database\(\)/u);
  assert.match(route, /current_setting\('server_version'\)/u);
  assert.match(route, /shopDomain: historicalShopDomain/u);
  assert.match(route, /accessTokenEncrypted: true/u);
  assert.match(route, /Boolean\(historicalStore\.accessTokenEncrypted\)/u);
  assert.match(route, /Cache-Control.*no-store/u);
  assert.doesNotMatch(route, /request\.json|searchParams|\$executeRaw|\.create\(|\.update\(|\.delete\(/u);
});
