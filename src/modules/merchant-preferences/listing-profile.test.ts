import assert from 'node:assert/strict';
import test from 'node:test';
import { createMerchantBusinessProfile } from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { MerchantPreferenceError } from './errors.ts';
import { resolveEffectiveMerchantPreferences } from './effective-preferences.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import {
  LISTING_PREFERENCE_SCHEMA_VERSION,
  listingPreferenceSectionDefinition,
} from './listing-section.ts';
import {
  createListingProfileForStandard,
  listingProfileDataSchema,
  listingStandardIds,
  listingStandards,
} from './listing-standard.ts';
import type {
  MerchantBusinessProfileRecord,
  MerchantPreferenceSectionRecord,
} from './types.ts';
import { preferenceSectionAuditEvent } from './audit.ts';

const now = new Date('2026-08-03T12:00:00.000Z');
const workspaceId = '00000000-0000-4000-8000-000000000001';

function listingRecord(
  payload = createListingProfileForStandard('NEOVIX'),
  overrides: Partial<MerchantPreferenceSectionRecord> = {},
): MerchantPreferenceSectionRecord {
  return {
    id: 'listing-section',
    workspaceId,
    sectionId: 'listing',
    schemaVersion: 1,
    version: 1,
    status: payload.configurationStatus === 'CONFIGURED' ? 'COMPLETE' : 'IN_PROGRESS',
    validationStatus: 'VALID',
    source: 'MANUAL',
    payload,
    fingerprint: stableMerchantPreferenceFingerprint(payload),
    metadata: {},
    completedAt: payload.configurationStatus === 'CONFIGURED' ? now : null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function profileRecord(
  section: MerchantPreferenceSectionRecord,
): MerchantBusinessProfileRecord {
  return {
    id: 'profile-1',
    workspaceId,
    version: 1,
    status: section.status === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
    lastCompletedSectionId: section.status === 'COMPLETE' ? 'listing' : null,
    fingerprint: 'a'.repeat(64),
    metadata: {},
    createdAt: now,
    updatedAt: now,
    sections: [section],
  };
}

test('registers every built-in Listing Standard with stable identities', () => {
  assert.deepEqual(listingStandardIds, [
    'LEARN_FROM_STORE', 'NEOVIX', 'MARKETPLACE', 'ELECTRONICS_RETAIL',
    'LUXURY_RETAIL', 'MINIMAL', 'CUSTOM',
  ]);
  assert.equal(listingStandards.length, 7);
  assert.equal(listingStandards.find(({ id }) => id === 'NEOVIX')?.badge, 'Recommended for Electronics');
});

test('implements the NEOVIX specification-first defaults', () => {
  const data = createListingProfileForStandard('NEOVIX');
  assert.deepEqual(data.rules?.title.fieldOrder, [
    'BRAND', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY', 'MODEL',
  ]);
  assert.equal(data.rules?.title.characterLimit, 140);
  assert.equal(data.rules?.description.structure, 'SPECIFICATIONS_FIRST');
  assert.equal(data.rules?.description.technicalLevel, 'DETAILED');
  assert.equal(data.rules?.features.count, 10);
  assert.deepEqual(data.rules?.prohibitedContent, ['Best', 'Perfect', 'Cheapest']);
});

test('uses distinct, valid defaults for Marketplace, Electronics, Luxury, Minimal and Custom', () => {
  for (const id of ['MARKETPLACE', 'ELECTRONICS_RETAIL', 'LUXURY_RETAIL', 'MINIMAL'] as const) {
    const data = createListingProfileForStandard(id);
    assert.equal(data.configurationStatus, 'STANDARD_SELECTED');
    assert.ok(data.rules);
    assert.equal(listingProfileDataSchema.safeParse(data).success, true);
  }
  const custom = createListingProfileForStandard('CUSTOM');
  assert.equal(custom.rules, null);
  assert.equal(custom.configurationStatus, 'STANDARD_SELECTED');
});

test('stores Learn From My Store as a pending-analysis architecture state', () => {
  const data = createListingProfileForStandard('LEARN_FROM_STORE');
  assert.equal(data.learningMode, 'LEARN_FROM_STORE');
  assert.equal(data.analysisStatus, 'PENDING_ANALYSIS');
  assert.equal(data.rules, null);
  const completion = listingPreferenceSectionDefinition.completionEvaluator(data);
  assert.equal(completion.complete, true);
  assert.equal(completion.status, 'COMPLETE');
});

test('requires configured rules for standard-based Listing Profile completion', () => {
  const selected = createListingProfileForStandard('NEOVIX');
  const started = listingPreferenceSectionDefinition.completionEvaluator(selected);
  assert.equal(started.status, 'IN_PROGRESS');
  const configured = { ...selected, configurationStatus: 'CONFIGURED' as const };
  const completed = listingPreferenceSectionDefinition.completionEvaluator(configured);
  assert.equal(completed.status, 'COMPLETE');
  assert.equal(completed.complete, true);
});

test('rejects invalid standard data, duplicate prohibited content and invalid limits', () => {
  const neovix = createListingProfileForStandard('NEOVIX');
  assert.equal(listingProfileDataSchema.safeParse({ ...neovix, standardId: 'UNKNOWN' }).success, false);
  assert.equal(listingProfileDataSchema.safeParse({
    ...neovix,
    configurationStatus: 'CONFIGURED',
    rules: { ...neovix.rules!, prohibitedContent: ['Best', ' best '] },
  }).success, false);
  assert.equal(listingProfileDataSchema.safeParse({
    ...neovix,
    configurationStatus: 'CONFIGURED',
    rules: { ...neovix.rules!, title: { ...neovix.rules!.title, characterLimit: 15 } },
  }).success, false);
});

test('resolves platform defaults, selected standard and merchant customizations safely', () => {
  const registry = createMerchantPreferenceRegistry();
  const defaults = resolveEffectiveMerchantPreferences(workspaceId, null, registry);
  assert.equal(defaults.listing.source, 'PLATFORM_DEFAULT');
  assert.equal(defaults.listing.complete, false);
  const configured = {
    ...createListingProfileForStandard('NEOVIX'),
    configurationStatus: 'CONFIGURED' as const,
    rules: {
      ...createListingProfileForStandard('NEOVIX').rules!,
      title: { ...createListingProfileForStandard('NEOVIX').rules!.title, characterLimit: 130 },
    },
  };
  const profile = createMerchantBusinessProfile(profileRecord(listingRecord(configured)), registry);
  const effective = resolveEffectiveMerchantPreferences(workspaceId, profile, registry);
  assert.equal(effective.listing.standardId, 'NEOVIX');
  assert.equal(effective.listing.rules?.title.characterLimit, 130);
  assert.equal(effective.listing.source, 'MANUAL');
  assert.match(effective.listing.sourceExplanation, /selected Listing Standard/);
});

test('completion tracks Listing separately from Catalog and future reserved sections', () => {
  const registry = createMerchantPreferenceRegistry();
  const selected = createListingProfileForStandard('NEOVIX');
  const completion = evaluateMerchantBusinessProfileCompletion(
    createMerchantBusinessProfile(profileRecord(listingRecord(selected)), registry),
    registry,
  );
  assert.equal(completion.listingStandardSelected, true);
  assert.equal(completion.listingComplete, false);
  assert.equal(completion.nextRequiredSection, 'catalog');
});

test('Listing audit events remain specific and do not contain raw rules', () => {
  const event = preferenceSectionAuditEvent({
    sectionId: 'listing', source: 'MANUAL', previousVersion: null,
    newVersion: 1, status: 'IN_PROGRESS', listingEvent: 'STANDARD_SELECTED',
  });
  assert.equal(event.action, 'listing_profile.standard_selected');
  assert.doesNotMatch(JSON.stringify(event), /characterLimit|prohibitedContent/);
  assert.equal(preferenceSectionAuditEvent({
    sectionId: 'listing', source: 'MERCHANT_EDIT', previousVersion: 1,
    previousStatus: 'IN_PROGRESS', newVersion: 2, status: 'COMPLETE', listingEvent: 'COMPLETED',
  }).action, 'listing_profile.completed');
});

test('unsupported Listing versions fail with an explicit conflict', () => {
  assert.throws(
    () => listingPreferenceSectionDefinition.migrate({}, 2),
    (error: unknown) => error instanceof MerchantPreferenceError
      && error.code === 'UNSUPPORTED_SECTION_VERSION'
      && error.statusCode === 409,
  );
  assert.equal(LISTING_PREFERENCE_SCHEMA_VERSION, 1);
});
