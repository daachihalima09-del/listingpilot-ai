import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMerchantBusinessProfile } from './business-profile.ts';
import {
  catalogProfileRecordToPreferenceSection,
} from './catalog-section.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import type {
  MerchantCatalogProfileRepository,
} from '../onboarding/catalog-profile/profile-service.ts';
import {
  getMerchantCatalogProfile,
  saveMerchantCatalogProfile,
} from '../onboarding/catalog-profile/profile-service.ts';
import type {
  MerchantCatalogProfileRecord,
} from '../onboarding/catalog-profile/types.ts';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const now = new Date('2026-08-01T12:00:00.000Z');
const legacyRecord: MerchantCatalogProfileRecord = {
  id: 'legacy-profile',
  workspaceId: 'workspace-1',
  setupMode: 'SHOPIFY_IMPORT',
  version: 4,
  completedAt: now,
  updatedAt: now,
  entries: [
    {
      kind: 'COLLECTION',
      value: 'Featured',
      normalizedValue: 'featured',
      position: 0,
    },
    {
      kind: 'PRODUCT_TYPE',
      value: 'Table',
      normalizedValue: 'table',
      position: 0,
    },
    {
      kind: 'VENDOR',
      value: 'Northwind',
      normalizedValue: 'northwind',
      position: 0,
    },
  ],
};

test('adapts an existing Catalog Profile to schema version 1 without data loss', () => {
  const section = catalogProfileRecordToPreferenceSection(legacyRecord);
  assert.equal(section.schemaVersion, 1);
  assert.equal(section.version, 4);
  assert.equal(section.source, 'SHOPIFY_IMPORT');
  assert.deepEqual(section.payload, {
    setupMode: 'SHOPIFY_IMPORT',
    collections: ['Featured'],
    productTypes: ['Table'],
    vendors: ['Northwind'],
  });
});

test('keeps an existing valid Catalog Profile complete while requiring the new Listing step', () => {
  const section = catalogProfileRecordToPreferenceSection(legacyRecord);
  const profile = createMerchantBusinessProfile({
    id: 'adapted-business-profile',
    workspaceId: legacyRecord.workspaceId,
    version: legacyRecord.version,
    status: 'COMPLETE',
    lastCompletedSectionId: 'catalog',
    fingerprint: section.fingerprint,
    metadata: { adaptedFrom: 'MerchantCatalogProfile' },
    createdAt: now,
    updatedAt: now,
    sections: [section],
  }, createMerchantPreferenceRegistry());
  const completion = evaluateMerchantBusinessProfileCompletion(
    profile,
    createMerchantPreferenceRegistry(),
  );
  assert.equal(completion.catalogComplete, true);
  assert.equal(completion.listingComplete, false);
  assert.equal(completion.completeEnoughToProceed, false);
});

test('preserves the existing Catalog Profile API DTO and adds concurrency safely', async () => {
  const saveInputs:
  Parameters<MerchantCatalogProfileRepository['save']>[0][] = [];
  const repository: MerchantCatalogProfileRepository = {
    async findByWorkspaceId() {
      return legacyRecord;
    },
    async save(input) {
      saveInputs.push(input);
      return { ...legacyRecord, version: 5 };
    },
  };
  const existing = await getMerchantCatalogProfile(
    repository,
    legacyRecord.workspaceId,
  );
  assert.deepEqual(existing, {
    id: 'legacy-profile',
    workspaceId: 'workspace-1',
    setupMode: 'SHOPIFY_IMPORT',
    version: 4,
    completedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    collections: ['Featured'],
    productTypes: ['Table'],
    vendors: ['Northwind'],
  });
  await saveMerchantCatalogProfile(repository, {
    actorUserId: 'user-1',
    organizationId: 'organization-1',
    workspaceId: 'workspace-1',
    role: 'OWNER',
  }, {
    setupMode: 'SHOPIFY_IMPORT',
    collections: ['Featured'],
    productTypes: ['Table'],
    vendors: ['Northwind'],
  }, 4);
  assert.equal(saveInputs[0]?.expectedVersion, 4);
});

test('onboarding guards use Business Profile completion and retain existing routes', () => {
  const guard = readFileSync(
    `${root}/src/modules/onboarding/catalog-profile/onboarding-gate.server.ts`,
    'utf8',
  );
  const callback = readFileSync(
    `${root}/src/app/api/shopify/callback/route.ts`,
    'utf8',
  );
  const launch = readFileSync(
    `${root}/src/app/api/shopify/launch/continue/route.ts`,
    'utf8',
  );
  const dashboard = readFileSync(`${root}/src/app/page.tsx`, 'utf8');
  const projectCreate = readFileSync(
    `${root}/src/app/projects/new/page.tsx`,
    'utf8',
  );
  const existingProject = readFileSync(
    `${root}/src/app/workspace/[projectId]/page.tsx`,
    'utf8',
  );
  assert.match(guard, /createServerMerchantPreferenceService/);
  assert.match(guard, /\.getCompletion\(workspaceId\)/);
  assert.doesNotMatch(guard, /merchantCatalogProfile\.find/);
  for (const source of [callback, launch]) {
    assert.match(source, /returnPathAfterShopifyConnection/);
  }
  for (const source of [dashboard, projectCreate]) {
    assert.match(source, /merchantBusinessProfileOnboardingPathIfRequired/);
  }
  assert.doesNotMatch(
    existingProject,
    /catalogProfileOnboardingPathIfRequired/,
  );
  assert.match(guard, /\/onboarding\/catalog-profile/);
});

test('Shopify catalog import remains a read-only query path', () => {
  const source = readFileSync(
    `${root}/src/modules/onboarding/catalog-profile/shopify-import-service.ts`,
    'utf8',
  );
  assert.match(source, /importMerchantCatalogValues/);
  assert.doesNotMatch(
    source,
    /\.(create|update|delete|mutate|publish)(Product|Collection|Variant)/,
  );
});
