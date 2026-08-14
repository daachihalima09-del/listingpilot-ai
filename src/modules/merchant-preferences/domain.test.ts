import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMerchantBusinessProfile,
  findMerchantPreferenceSection,
} from './business-profile.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import {
  activeMerchantPreferenceSectionIds,
  reservedMerchantPreferenceSectionIds,
} from './section-ids.ts';
import {
  businessProfileRecordFixture,
  catalogSectionRecordFixture,
} from './test-fixtures.ts';

test('creates an immutable Business Profile with all five active sections', () => {
  const profile = createMerchantBusinessProfile(
    businessProfileRecordFixture(),
    createMerchantPreferenceRegistry(),
  );
  assert.equal(profile.workspaceId, 'workspace-1');
  assert.deepEqual(profile.activeSectionIds, ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  assert.equal(findMerchantPreferenceSection(profile, 'catalog')?.status, 'COMPLETE');
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.sections), true);
  assert.equal(Object.isFrozen(profile.sections[0].data), true);
  assert.throws(() => {
    (profile.sections as unknown[]).push({});
  }, TypeError);
});

test('activates Publishing and AI in the established profile order', () => {
  assert.deepEqual(activeMerchantPreferenceSectionIds, ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  assert.deepEqual(reservedMerchantPreferenceSectionIds, []);
});

test('Business Profile fingerprints ignore timestamps and stored fingerprint fields', () => {
  const registry = createMerchantPreferenceRegistry();
  const first = createMerchantBusinessProfile(
    businessProfileRecordFixture(),
    registry,
  );
  const second = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      fingerprint: 'b'.repeat(64),
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2031-01-01T00:00:00.000Z'),
      sections: [catalogSectionRecordFixture({
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
        updatedAt: new Date('2031-01-01T00:00:00.000Z'),
      })],
    }),
    registry,
  );
  assert.equal(first.fingerprint, second.fingerprint);
});

test('unsupported persisted section identities fail closed without crashing the profile', () => {
  const profile = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      sections: [
        catalogSectionRecordFixture(),
        catalogSectionRecordFixture({
          id: 'unknown',
          sectionId: 'unknown-future-section',
        }),
      ],
    }),
    createMerchantPreferenceRegistry(),
  );
  assert.equal(profile.status, 'INVALID');
  assert.equal(profile.sections.length, 1);
});

test('unsupported schema versions and malformed payloads become invalid sections', () => {
  const registry = createMerchantPreferenceRegistry();
  for (const section of [
    catalogSectionRecordFixture({ schemaVersion: 99 }),
    catalogSectionRecordFixture({ payload: { collections: 'bad' } }),
  ]) {
    const profile = createMerchantBusinessProfile(
      businessProfileRecordFixture({ sections: [section] }),
      registry,
    );
    assert.equal(profile.status, 'INVALID');
    assert.equal(profile.sections[0].status, 'INVALID');
    assert.equal(profile.sections[0].data, null);
  }
});

test('duplicate persisted active sections mark the profile invalid', () => {
  const profile = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      sections: [
        catalogSectionRecordFixture({ id: 'section-a' }),
        catalogSectionRecordFixture({ id: 'section-b' }),
      ],
    }),
    createMerchantPreferenceRegistry(),
  );
  assert.equal(profile.status, 'INVALID');
  assert.equal(profile.sections.length, 1);
});
