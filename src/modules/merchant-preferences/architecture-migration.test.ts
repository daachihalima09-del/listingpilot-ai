import assert from 'node:assert/strict';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

test('preference domain has no UI, intelligence, OpenAI or Shopify mutation imports', () => {
  const productionSources = readdirSync(moduleDirectory)
    .filter((file) => (
      file.endsWith('.ts')
      && !file.endsWith('.test.ts')
      && file !== 'test-fixtures.ts'
    ))
    .map((file) => readFileSync(`${moduleDirectory}/${file}`, 'utf8'))
    .join('\n');
  assert.doesNotMatch(productionSources, /from ['"]react/);
  assert.doesNotMatch(productionSources, /from ['"]next\//);
  assert.doesNotMatch(productionSources, /modules\/intelligence/);
  assert.doesNotMatch(productionSources, /modules\/openai|openai\//);
  assert.doesNotMatch(
    productionSources,
    /modules\/shopify\/(products|variants|images|metafields|publishing)/,
  );
  assert.doesNotMatch(productionSources, /components\//);
});

test('migration creates balanced workspace and section persistence constraints', () => {
  const migration = readFileSync(
    `${projectRoot}/prisma/migrations/20260802010000_merchant_business_profile_architecture/migration.sql`,
    'utf8',
  );
  assert.match(migration, /CREATE TABLE "merchant_business_profiles"/);
  assert.match(migration, /CREATE TABLE "merchant_preference_sections"/);
  assert.match(
    migration,
    /UNIQUE INDEX "merchant_preference_sections_workspace_id_section_id_key"/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("business_profile_id", "workspace_id"\)/,
  );
  assert.match(migration, /"schema_version" INTEGER NOT NULL/);
  assert.match(migration, /"version" INTEGER NOT NULL DEFAULT 1/);
  assert.match(migration, /"payload" JSONB NOT NULL/);
});

test('migration safely backfills Catalog values and does not persist fake sections', () => {
  const migration = readFileSync(
    `${projectRoot}/prisma/migrations/20260802010000_merchant_business_profile_architecture/migration.sql`,
    'utf8',
  );
  assert.match(migration, /FROM merchant_catalog_profiles catalog/);
  assert.match(migration, /FROM merchant_catalog_entries entry/);
  assert.match(migration, /'collections'/);
  assert.match(migration, /'productTypes'/);
  assert.match(migration, /'vendors'/);
  assert.match(migration, /'catalog',\s+1,/);
  assert.match(migration, /ON CONFLICT \(workspace_id\) DO NOTHING/);
  assert.match(
    migration,
    /ON CONFLICT \(workspace_id, section_id\) DO NOTHING/,
  );
  assert.doesNotMatch(migration, /INSERT[\s\S]*?'listing'/);
  assert.doesNotMatch(migration, /INSERT[\s\S]*?'seo'/);
  assert.doesNotMatch(migration, /INSERT[\s\S]*?'publishing'/);
  assert.doesNotMatch(migration, /INSERT[\s\S]*?'ai'/);
});

test('production repositories use transactions and workspace-scoped section keys', () => {
  const genericRepository = readFileSync(
    `${moduleDirectory}/prisma-repository.server.ts`,
    'utf8',
  );
  const compatibilityRepository = readFileSync(
    `${projectRoot}/src/modules/onboarding/catalog-profile/prisma-profile-repository.server.ts`,
    'utf8',
  );
  for (const source of [genericRepository, compatibilityRepository]) {
    assert.match(source, /prisma\.\$transaction/);
    assert.match(source, /workspaceId/);
    assert.match(source, /PREFERENCE_CONCURRENCY_CONFLICT|ConcurrencyError/);
  }
  assert.match(genericRepository, /workspaceId_sectionId/);
  assert.match(genericRepository, /updateMany/);
  assert.match(compatibilityRepository, /merchantBusinessProfile\.upsert/);
  assert.match(compatibilityRepository, /merchantPreferenceSection/);
});

