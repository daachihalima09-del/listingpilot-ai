import assert from 'node:assert/strict';
import test from 'node:test';
import { MerchantCatalogProfileError } from './errors.ts';
import {
  getMerchantCatalogProfile,
  saveMerchantCatalogProfile,
  type MerchantCatalogProfileRepository,
} from './profile-service.ts';
import type { MerchantCatalogProfileRecord } from './types.ts';

const now = new Date('2026-08-01T12:00:00.000Z');
const emptyRecord = (): MerchantCatalogProfileRecord => ({
  id: 'profile-1',
  workspaceId: 'workspace-1',
  setupMode: 'MANUAL',
  version: 1,
  completedAt: now,
  updatedAt: now,
  entries: [],
});

function repository(record: MerchantCatalogProfileRecord | null = null) {
  let savedInput: Parameters<MerchantCatalogProfileRepository['save']>[0]
    | null = null;
  const value: MerchantCatalogProfileRepository = {
    async findByWorkspaceId() {
      return record;
    },
    async save(input) {
      savedInput = input;
      return {
        ...emptyRecord(),
        setupMode: input.profile.setupMode,
        entries: [
          ...input.profile.collections.map((entry, position) => ({
            kind: 'COLLECTION' as const,
            value: entry,
            normalizedValue: entry.toLocaleLowerCase('en-US'),
            position,
          })),
          ...input.profile.productTypes.map((entry, position) => ({
            kind: 'PRODUCT_TYPE' as const,
            value: entry,
            normalizedValue: entry.toLocaleLowerCase('en-US'),
            position,
          })),
          ...input.profile.vendors.map((entry, position) => ({
            kind: 'VENDOR' as const,
            value: entry,
            normalizedValue: entry.toLocaleLowerCase('en-US'),
            position,
          })),
        ],
      };
    },
  };
  return { value, saved: () => savedInput };
}

const ownerAccess = {
  actorUserId: 'user-1',
  organizationId: 'organization-1',
  workspaceId: 'workspace-1',
  role: 'OWNER' as const,
};

test('saves a normalized owner profile and returns client-safe ordered values', async () => {
  const context = repository();
  const profile = await saveMerchantCatalogProfile(
    context.value,
    ownerAccess,
    {
      setupMode: 'SHOPIFY_IMPORT',
      collections: [' Featured ', 'Sale'],
      productTypes: ['Table'],
      vendors: ['Vendor Inc.'],
    },
  );
  assert.deepEqual(profile.collections, ['Featured', 'Sale']);
  assert.deepEqual(profile.productTypes, ['Table']);
  assert.deepEqual(profile.vendors, ['Vendor Inc.']);
  assert.equal(context.saved()?.workspaceId, 'workspace-1');
  assert.equal(context.saved()?.actorUserId, 'user-1');
});

test('prevents non-owners from saving before the repository is called', async () => {
  const context = repository();
  await assert.rejects(
    saveMerchantCatalogProfile(context.value, {
      ...ownerAccess,
      role: 'ADMIN',
    }, {
      setupMode: 'MANUAL',
      collections: [],
      productTypes: [],
      vendors: [],
    }),
    (error: unknown) => (
      error instanceof MerchantCatalogProfileError
      && error.code === 'OWNER_REQUIRED'
      && error.statusCode === 403
    ),
  );
  assert.equal(context.saved(), null);
});

test('loads and serializes an existing workspace profile', async () => {
  const record = {
    ...emptyRecord(),
    entries: [
      {
        kind: 'VENDOR' as const,
        value: 'Vendor',
        normalizedValue: 'vendor',
        position: 0,
      },
    ],
  };
  const profile = await getMerchantCatalogProfile(
    repository(record).value,
    'workspace-1',
  );
  assert.equal(profile?.completedAt, now.toISOString());
  assert.deepEqual(profile?.vendors, ['Vendor']);
});
