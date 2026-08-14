import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMerchantBusinessProfile } from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { resolveEffectiveMerchantPreferences } from './effective-preferences.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { preferenceSectionAuditEvent } from './audit.ts';
import { SEO_PREFERENCE_SCHEMA_VERSION, seoPreferenceSectionDefinition } from './seo-section.ts';
import { createSeoProfile, listingPilotSeoStandard, seoProfileDataSchema } from './seo-profile.ts';
import type { MerchantBusinessProfileRecord, MerchantPreferenceSectionRecord } from './types.ts';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-04T12:00:00.000Z');
const root = fileURLToPath(new URL('../../..', import.meta.url));
function section(payload = createSeoProfile('LISTINGPILOT_STANDARD'), overrides: Partial<MerchantPreferenceSectionRecord> = {}): MerchantPreferenceSectionRecord { return { id: 'seo-1', workspaceId, sectionId: 'seo', schemaVersion: 1, version: 1, status: 'COMPLETE', validationStatus: 'VALID', source: 'MANUAL', payload, fingerprint: stableMerchantPreferenceFingerprint(payload), metadata: {}, completedAt: now, createdAt: now, updatedAt: now, ...overrides }; }
function record(seoSection: MerchantPreferenceSectionRecord): MerchantBusinessProfileRecord { return { id: 'profile-1', workspaceId, version: 1, status: 'INCOMPLETE', lastCompletedSectionId: 'seo', fingerprint: 'a'.repeat(64), metadata: {}, createdAt: now, updatedAt: now, sections: [seoSection] }; }

test('SEO schema version 1 creates all three valid setup modes', () => {
  assert.equal(SEO_PREFERENCE_SCHEMA_VERSION, 1);
  for (const mode of ['LISTINGPILOT_STANDARD', 'REVIEW_EXISTING_SEO', 'MANUAL'] as const) assert.equal(seoProfileDataSchema.safeParse(createSeoProfile(mode)).success, true);
});

test('profile copies cannot mutate the built-in ListingPilot SEO Standard', () => {
  const first = createSeoProfile('MANUAL');
  first.rules.title.separator = 'DASH';
  first.rules.searchIntent.priorities.reverse();
  const second = createSeoProfile('MANUAL');
  assert.equal(Object.isFrozen(listingPilotSeoStandard), true);
  assert.equal(listingPilotSeoStandard.title.separator, 'PIPE');
  assert.deepEqual(second.rules.searchIntent.priorities, ['EXACT_MODEL', 'PRODUCT_DISCOVERY', 'FEATURE_LED', 'LOCAL_PURCHASE']);
});

test('Review Existing SEO remains complete with pending diagnostic analysis', () => {
  const profile = createSeoProfile('REVIEW_EXISTING_SEO');
  assert.equal(profile.analysisStatus, 'PENDING_ANALYSIS');
  assert.equal(seoPreferenceSectionDefinition.completionEvaluator(profile).complete, true);
});

test('rejects invalid setup and analysis combinations', () => {
  assert.equal(seoProfileDataSchema.safeParse({ ...createSeoProfile('MANUAL'), analysisStatus: 'PENDING_ANALYSIS' }).success, false);
  assert.equal(seoProfileDataSchema.safeParse({ ...createSeoProfile('REVIEW_EXISTING_SEO'), analysisStatus: 'NOT_REQUIRED' }).success, false);
  assert.equal(seoProfileDataSchema.safeParse({ ...createSeoProfile('MANUAL'), setupMode: 'UNKNOWN' }).success, false);
});

test('validates ranges, duplicate intent, prohibited terms and repetition thresholds', () => {
  const base = createSeoProfile('MANUAL');
  const invalid = [
    { ...base, rules: { ...base.rules, title: { ...base.rules.title, targetRange: { minimum: 80, maximum: 40 } } } },
    { ...base, rules: { ...base.rules, metaDescription: { ...base.rules.metaDescription, targetRange: { minimum: 200, maximum: 100 } } } },
    { ...base, rules: { ...base.rules, searchIntent: { priorities: ['EXACT_MODEL', 'EXACT_MODEL'] } } },
    { ...base, rules: { ...base.rules, keywords: { ...base.rules.keywords, prohibitedTerms: ['free', ' FREE '] } } },
    { ...base, rules: { ...base.rules, keywords: { ...base.rules.keywords, repetitionThreshold: 10 } } },
  ];
  for (const value of invalid) assert.equal(seoProfileDataSchema.safeParse(value).success, false);
});

test('rejects empty manual rules, unsafe handle and indexing changes, and unknown enum values', () => {
  const base = createSeoProfile('MANUAL');
  const invalid = [
    { ...base, rules: {} },
    { ...base, rules: { ...base.rules, urlHandle: { ...base.rules.urlHandle, enforceLowercase: false } } },
    { ...base, rules: { ...base.rules, urlHandle: { ...base.rules.urlHandle, redirectRequiredForReplacement: false } } },
    { ...base, rules: { ...base.rules, indexing: { ...base.rules.indexing, neverAutoNoindex: false } } },
    { ...base, rules: { ...base.rules, indexing: { ...base.rules.indexing, requireConfirmationForNoindex: false } } },
    { ...base, rules: { ...base.rules, title: { ...base.rules.title, separator: 'UNKNOWN' } } },
  ];
  for (const value of invalid) assert.equal(seoProfileDataSchema.safeParse(value).success, false);
});

test('ListingPilot SEO Standard preserves non-negotiable safety policies', () => {
  assert.equal(listingPilotSeoStandard.urlHandle.existingHandlePolicy, 'PRESERVE_EXISTING');
  assert.equal(listingPilotSeoStandard.indexing.neverAutoNoindex, true);
  assert.equal(listingPilotSeoStandard.indexing.requireConfirmationForNoindex, true);
  assert.equal(listingPilotSeoStandard.structuredData.neverInventIdentifiers, true);
  assert.equal(listingPilotSeoStandard.structuredData.injectStructuredData, false);
  assert.equal(listingPilotSeoStandard.branding.separateBrandAndVendor, true);
  assert.equal(listingPilotSeoStandard.branding.deriveBrandFromVendor, false);
  assert.equal(listingPilotSeoStandard.quality.requireVerifiedClaims, true);
  assert.equal(listingPilotSeoStandard.quality.requireUniqueTitle, true);
  assert.equal(listingPilotSeoStandard.quality.requireUniqueDescription, true);
  assert.equal(listingPilotSeoStandard.structuredData.validateProduct, true);
  assert.equal(listingPilotSeoStandard.structuredData.validateOffer, true);
  assert.equal(listingPilotSeoStandard.imageSeo.existingAltTextPolicy, 'SUGGEST_IF_WEAK');
});

test('resolver applies safety defaults then workspace merchant customization', () => {
  const registry = createMerchantPreferenceRegistry();
  const defaults = resolveEffectiveMerchantPreferences(workspaceId, null, registry);
  assert.equal(defaults.seo.merchantConfigured, false);
  assert.equal(defaults.seo.values.rules.indexing.neverAutoNoindex, true);
  const customized = createSeoProfile('MANUAL'); customized.rules.title.separator = 'DASH';
  const domain = createMerchantBusinessProfile(record(section(customized)), registry);
  const effective = resolveEffectiveMerchantPreferences(workspaceId, domain, registry);
  assert.equal(effective.seo.values.rules.title.separator, 'DASH');
  assert.equal(effective.seo.values.rules.indexing.neverAutoNoindex, true);
  assert.equal(effective.seo.sourceByRuleGroup.title, 'MANUAL');
  assert.match(effective.seo.sourceExplanation, /safety defaults/);
});

test('effective SEO fingerprints are deterministic and workspace isolated', () => {
  const registry = createMerchantPreferenceRegistry();
  const left = resolveEffectiveMerchantPreferences(workspaceId, null, registry);
  const repeated = resolveEffectiveMerchantPreferences(workspaceId, null, registry);
  const other = resolveEffectiveMerchantPreferences('00000000-0000-4000-8000-000000000002', null, registry);
  assert.equal(left.seo.fingerprint, repeated.seo.fingerprint);
  assert.notEqual(left.fingerprint, other.fingerprint);
});

test('resolver reports pending analysis without weakening non-negotiable rules', () => {
  const registry = createMerchantPreferenceRegistry();
  const pending = createSeoProfile('REVIEW_EXISTING_SEO');
  const effective = resolveEffectiveMerchantPreferences(
    workspaceId,
    createMerchantBusinessProfile(record(section(pending)), registry),
    registry,
  );
  assert.equal(effective.seo.pendingAnalysis, true);
  assert.equal(effective.seo.complete, true);
  assert.equal(effective.seo.values.rules.indexing.neverAutoNoindex, true);
  assert.equal(effective.seo.values.rules.structuredData.neverInventIdentifiers, true);
  assert.equal(effective.seo.sourceByRuleGroup.indexing, 'MANUAL');
});

test('completion reports SEO as the next active onboarding requirement', () => {
  const registry = createMerchantPreferenceRegistry();
  const incomplete = evaluateMerchantBusinessProfileCompletion(null, registry);
  assert.deepEqual(incomplete.incompleteRequiredSections, ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  assert.equal(incomplete.seoComplete, false);
  const seoOnly = evaluateMerchantBusinessProfileCompletion(createMerchantBusinessProfile(record(section()), registry), registry);
  assert.equal(seoOnly.seoComplete, true);
  assert.equal(seoOnly.nextRequiredSection, 'catalog');
});

test('corrupted SEO payload fails closed without crashing the profile', () => {
  const registry = createMerchantPreferenceRegistry();
  const domain = createMerchantBusinessProfile(record(section({ broken: true } as never)), registry);
  const completion = evaluateMerchantBusinessProfileCompletion(domain, registry);
  assert.equal(completion.invalidSections.includes('seo'), true);
});

test('SEO audit events are specific, bounded and payload-free', () => {
  const event = preferenceSectionAuditEvent({ sectionId: 'seo', source: 'MANUAL', previousVersion: null, newVersion: 1, status: 'COMPLETE', seoEvent: 'CREATED' });
  assert.equal(event.action, 'seo_profile.created');
  assert.doesNotMatch(JSON.stringify(event), /prohibitedTerms|searchIntent|Shopify product/);
  assert.equal(preferenceSectionAuditEvent({ sectionId: 'seo', source: 'MANUAL', previousVersion: null, newVersion: 1, status: 'COMPLETE', seoEvent: 'REVIEW_REQUESTED' }).action, 'seo_profile.review_requested');
});

test('unsupported SEO versions fail explicitly', () => {
  assert.throws(() => seoPreferenceSectionDefinition.migrate({}, 2), (error: unknown) => error instanceof Error && /unsupported/i.test(error.message));
});

test('SEO onboarding API keeps authentication, ownership, concurrency and safe error contracts', () => {
  const route = readFileSync(`${root}/src/app/api/onboarding/seo-profile/route.ts`, 'utf8');
  const errors = readFileSync(`${root}/src/modules/onboarding/seo-profile/route-errors.server.ts`, 'utf8');
  assert.match(route, /getCurrentUser/);
  assert.match(route, /requireOwner|resolveMerchantListingProfileAccess\(user\.id, input\.workspaceId, true\)/);
  assert.match(route, /expectedVersion/);
  assert.match(route, /getMerchantSeoProfileView/);
  assert.match(errors, /PREFERENCE_CONCURRENCY_CONFLICT|error\.statusCode/);
  assert.doesNotMatch(errors, /database|Prisma|accessTokenEncrypted/);
});

test('SEO onboarding does not generate metadata or mutate Shopify', () => {
  const files = [
    `${root}/src/modules/merchant-preferences/seo-profile.ts`,
    `${root}/src/modules/onboarding/seo-profile/seo-profile-service.ts`,
    `${root}/src/app/api/onboarding/seo-profile/route.ts`,
  ];
  const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /\.(productCreate|productUpdate|metafieldsSet|publishablePublish|fileCreate)\b/);
  assert.doesNotMatch(source, /generateSeo|generateTitle|generateMetaDescription|openai/i);
});
