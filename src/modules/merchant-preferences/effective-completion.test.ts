import assert from 'node:assert/strict';
import test from 'node:test';
import { createMerchantBusinessProfile } from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { resolveEffectiveMerchantPreferences } from './effective-preferences.ts';
import {
  businessProfileRecordFixture,
  catalogPreferenceFixture,
  catalogSectionRecordFixture,
} from './test-fixtures.ts';

const registry = createMerchantPreferenceRegistry();

test('platform defaults are empty, explicit and incomplete without a merchant profile', () => {
  const effective = resolveEffectiveMerchantPreferences(
    'workspace-1',
    null,
    registry,
  );
  assert.deepEqual(effective.catalog.collections, []);
  assert.equal(effective.catalog.source, 'PLATFORM_DEFAULT');
  assert.equal(effective.catalog.merchantConfigured, false);
  assert.equal(effective.catalog.complete, false);
});

test('merchant Catalog values override defaults with source explanation', () => {
  const profile = createMerchantBusinessProfile(
    businessProfileRecordFixture(),
    registry,
  );
  const effective = resolveEffectiveMerchantPreferences(
    'workspace-1',
    profile,
    registry,
  );
  assert.deepEqual(effective.catalog.collections, ['Featured', 'Sale']);
  assert.equal(effective.catalog.source, 'MANUAL');
  assert.equal(effective.catalog.merchantConfigured, true);
  assert.equal(effective.catalog.complete, true);
  assert.match(effective.catalog.sourceExplanation, /Merchant-approved/);
});

test('effective results are deterministic when catalog order is not semantic', () => {
  const left = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      sections: [catalogSectionRecordFixture({
        payload: catalogPreferenceFixture({
          collections: ['Sale', 'Featured'],
        }),
      })],
    }),
    registry,
  );
  const right = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      sections: [catalogSectionRecordFixture({
        payload: catalogPreferenceFixture({
          collections: ['Featured', 'Sale'],
        }),
      })],
    }),
    registry,
  );
  const leftEffective = resolveEffectiveMerchantPreferences(
    'workspace-1',
    left,
    registry,
  );
  const rightEffective = resolveEffectiveMerchantPreferences(
    'workspace-1',
    right,
    registry,
  );
  assert.deepEqual(leftEffective.catalog.collections, ['Featured', 'Sale']);
  assert.equal(leftEffective.fingerprint, rightEffective.fingerprint);
});

test('invalid stored payloads fall back safely without inventing merchant values', () => {
  const profile = createMerchantBusinessProfile(
    businessProfileRecordFixture({
      sections: [catalogSectionRecordFixture({
        payload: { setupMode: 'MANUAL', collections: 'bad' },
      })],
    }),
    registry,
  );
  const effective = resolveEffectiveMerchantPreferences(
    'workspace-1',
    profile,
    registry,
  );
  assert.deepEqual(effective.catalog.collections, []);
  assert.equal(effective.catalog.source, 'PLATFORM_DEFAULT');
  assert.equal(effective.catalog.validationStatus, 'INVALID');
  assert.equal(effective.catalog.complete, false);
});

test('completion requires all five Merchant Business Profile sections in onboarding order', () => {
  const incomplete = evaluateMerchantBusinessProfileCompletion(null, registry);
  assert.deepEqual(incomplete.incompleteRequiredSections, ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  assert.equal(incomplete.nextRequiredSection, 'catalog');
  assert.equal(incomplete.canCreateProject, false);
  assert.equal(incomplete.canPublishSafely, false);

  const complete = evaluateMerchantBusinessProfileCompletion(
    createMerchantBusinessProfile(
      businessProfileRecordFixture(),
      registry,
    ),
    registry,
  );
  assert.equal(complete.status, 'INCOMPLETE');
  assert.equal(complete.catalogComplete, true);
  assert.equal(complete.nextRequiredSection, 'listing');
  assert.equal(complete.canCreateProject, false);
});

test('in-progress, review-required and invalid Catalog states remain explicit', () => {
  const cases = [
    {
      section: catalogSectionRecordFixture({
        status: 'IN_PROGRESS',
        validationStatus: 'VALID',
      }),
      expected: 'INCOMPLETE',
    },
    {
      section: catalogSectionRecordFixture({
        status: 'NEEDS_REVIEW',
        validationStatus: 'VALID',
      }),
      expected: 'NEEDS_REVIEW',
    },
    {
      section: catalogSectionRecordFixture({
        status: 'INVALID',
        validationStatus: 'INVALID',
      }),
      expected: 'INVALID',
    },
  ] as const;
  for (const { section, expected } of cases) {
    const completion = evaluateMerchantBusinessProfileCompletion(
      createMerchantBusinessProfile(
        businessProfileRecordFixture({ sections: [section] }),
        registry,
      ),
      registry,
    );
    assert.equal(completion.status, expected);
    assert.equal(completion.catalogComplete, false);
  }
});

test('the active Publishing and AI sections participate in Business Profile completion', () => {
  const completion = evaluateMerchantBusinessProfileCompletion(
    createMerchantBusinessProfile(
      businessProfileRecordFixture(),
      registry,
    ),
    registry,
  );
  assert.deepEqual(completion.incompleteRequiredSections, ['listing', 'seo', 'publishing', 'ai']);
  assert.equal(completion.completeEnoughToProceed, false);
});
