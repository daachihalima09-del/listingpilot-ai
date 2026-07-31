import type { CatalogPreferenceData } from './catalog-section.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import type {
  MerchantBusinessProfileRecord,
  MerchantPreferenceSectionRecord,
} from './types.ts';

export const fixtureNow = new Date('2026-08-02T12:00:00.000Z');

export function catalogPreferenceFixture(
  overrides: Partial<CatalogPreferenceData> = {},
): CatalogPreferenceData {
  return {
    setupMode: 'MANUAL',
    collections: ['Featured', 'Sale'],
    productTypes: ['Table'],
    vendors: ['Northwind'],
    ...overrides,
  };
}

export function catalogSectionRecordFixture(
  overrides: Partial<MerchantPreferenceSectionRecord> = {},
): MerchantPreferenceSectionRecord {
  const payload = overrides.payload ?? catalogPreferenceFixture();
  return {
    id: 'section-1',
    workspaceId: 'workspace-1',
    sectionId: 'catalog',
    schemaVersion: 1,
    version: 1,
    status: 'COMPLETE',
    validationStatus: 'VALID',
    source: 'MANUAL',
    payload,
    fingerprint: stableMerchantPreferenceFingerprint(payload),
    metadata: {},
    completedAt: fixtureNow,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    ...overrides,
  };
}

export function businessProfileRecordFixture(
  overrides: Partial<MerchantBusinessProfileRecord> = {},
): MerchantBusinessProfileRecord {
  return {
    id: 'profile-1',
    workspaceId: 'workspace-1',
    version: 1,
    status: 'COMPLETE',
    lastCompletedSectionId: 'catalog',
    fingerprint: 'a'.repeat(64),
    metadata: { architectureVersion: 1 },
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    sections: [catalogSectionRecordFixture()],
    ...overrides,
  };
}
