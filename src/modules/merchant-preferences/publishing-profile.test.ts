import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createMerchantBusinessProfile } from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { resolveEffectiveMerchantPreferences } from './effective-preferences.ts';
import { resolveEffectivePublishingProfile } from './effective-publishing-profile.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { preferenceSectionAuditEvent } from './audit.ts';
import { createPublishingPolicyContext } from './publishing-policy-context.ts';
import { createPublishingProfile, listingPilotPublishingSafeDefaults, publishingProfileDataSchema } from './publishing-profile.ts';
import { PUBLISHING_PREFERENCE_SCHEMA_VERSION, publishingPreferenceSectionDefinition } from './publishing-section.ts';
import type { MerchantBusinessProfileRecord, MerchantPreferenceSectionRecord } from './types.ts';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-05T12:00:00.000Z');
const root = fileURLToPath(new URL('../../..', import.meta.url));
function section(payload = createPublishingProfile('LISTINGPILOT_SAFE_DEFAULTS'), overrides: Partial<MerchantPreferenceSectionRecord> = {}): MerchantPreferenceSectionRecord { return { id: 'publishing-1', workspaceId, sectionId: 'publishing', schemaVersion: 1, version: 1, status: 'COMPLETE', validationStatus: 'VALID', source: 'MANUAL', payload, fingerprint: stableMerchantPreferenceFingerprint(payload), metadata: {}, completedAt: now, createdAt: now, updatedAt: now, ...overrides }; }
function record(publishingSection: MerchantPreferenceSectionRecord): MerchantBusinessProfileRecord { return { id: 'profile-1', workspaceId, version: 1, status: 'INCOMPLETE', lastCompletedSectionId: 'publishing', fingerprint: 'a'.repeat(64), metadata: {}, createdAt: now, updatedAt: now, sections: [publishingSection] }; }
function mutateProfile(mutator: (profile: ReturnType<typeof createPublishingProfile>) => void) { const profile = createPublishingProfile('MANUAL'); mutator(profile); return profile; }

test('Publishing schema version 1 creates every setup mode', () => {
  assert.equal(PUBLISHING_PREFERENCE_SCHEMA_VERSION, 1);
  for (const mode of ['LISTINGPILOT_SAFE_DEFAULTS', 'REVIEW_CURRENT_SHOPIFY_SETUP', 'MANUAL'] as const) assert.equal(publishingProfileDataSchema.safeParse(createPublishingProfile(mode)).success, true);
});

test('safe defaults are deeply immutable and profile copies remain independent', () => {
  assert.equal(Object.isFrozen(listingPilotPublishingSafeDefaults), true);
  assert.equal(Object.isFrozen(listingPilotPublishingSafeDefaults.variants), true);
  assert.equal(Object.isFrozen(listingPilotPublishingSafeDefaults.blockers), true);
  assert.throws(() => { (listingPilotPublishingSafeDefaults.blockers as unknown as unknown[]).push({}); }, TypeError);
  const first = createPublishingProfile('MANUAL'); first.policies.newProductStatus = 'ARCHIVED';
  assert.equal(createPublishingProfile('MANUAL').policies.newProductStatus, 'DRAFT');
});

test('safe defaults preserve merchant data and require explicit review', () => {
  const rules = listingPilotPublishingSafeDefaults;
  assert.equal(rules.newProductStatus, 'DRAFT');
  assert.equal(rules.approval.mode, 'ALWAYS_REQUIRE_APPROVAL');
  assert.equal(rules.approval.explicitMerchantActionRequired, true);
  assert.equal(rules.existingProductUpdateMode, 'UPDATE_EXISTING_AFTER_REVIEW');
  assert.equal(rules.inventory.policy, 'NEVER_UPDATE_INVENTORY');
  assert.equal(rules.variants.deletion, 'NEVER_DELETE');
  assert.equal(rules.images.deletion, 'NEVER_DELETE');
  assert.equal(rules.handle.policy, 'PRESERVE_EXISTING');
  assert.equal(rules.seo.title, 'PUBLISH_AFTER_APPROVAL');
  assert.equal(rules.blockers.find(({ condition }) => condition === 'CRITICAL_PRODUCT_TRUTH_CONFLICT')?.outcome, 'BLOCK');
  assert.equal(rules.blockers.find(({ condition }) => condition === 'MISSING_PRODUCT_INTELLIGENCE_PACK')?.outcome, 'WARN');
});

test('Review Current Shopify Setup is complete while safe defaults remain effective', () => {
  const profile = createPublishingProfile('REVIEW_CURRENT_SHOPIFY_SETUP');
  profile.policies.newProductStatus = 'ARCHIVED';
  const registry = createMerchantPreferenceRegistry();
  const effective = resolveEffectivePublishingProfile(createMerchantBusinessProfile(record(section(profile)), registry), registry);
  assert.equal(profile.analysisStatus, 'PENDING_ANALYSIS');
  assert.equal(publishingPreferenceSectionDefinition.completionEvaluator(profile).complete, true);
  assert.equal(effective.pendingAnalysis, true);
  assert.equal(effective.policies.newProductStatus, 'DRAFT');
  assert.equal(effective.sourceByPolicyGroup.newProductStatus, 'PLATFORM_DEFAULT');
});

test('manual mode rejects unknown, incomplete and duplicate policies', () => {
  const base = createPublishingProfile('MANUAL');
  const duplicate = structuredClone(base); duplicate.policies.fieldPolicies[1] = { ...duplicate.policies.fieldPolicies[0]! };
  assert.equal(publishingProfileDataSchema.safeParse(duplicate).success, false);
  assert.equal(publishingProfileDataSchema.safeParse({ ...base, setupMode: 'UNKNOWN' }).success, false);
  assert.equal(publishingProfileDataSchema.safeParse({ ...base, policies: {} }).success, false);
  assert.equal(publishingProfileDataSchema.safeParse({ ...base, futurePolicy: true }).success, false);
});

test('validation rejects unsafe approval, deletion, inventory and handle combinations', () => {
  const invalid = [
    mutateProfile((profile) => { profile.policies.newProductStatus = 'ACTIVE_AFTER_APPROVAL'; profile.policies.approval.requirements.productStatusChanges = false; }),
    mutateProfile((profile) => { profile.policies.variants.deletion = 'DELETE_AFTER_EXPLICIT_APPROVAL'; profile.policies.approval.requirements.variantDeletion = false; }),
    mutateProfile((profile) => { profile.policies.images.deletion = 'DELETE_AFTER_EXPLICIT_APPROVAL'; profile.policies.approval.requirements.imageDeletion = false; }),
    mutateProfile((profile) => { profile.policies.inventory.policy = 'UPDATE_AFTER_EXPLICIT_APPROVAL'; profile.policies.approval.requirements.inventoryChanges = false; }),
    mutateProfile((profile) => { profile.policies.handle.policy = 'UPDATE_AFTER_APPROVAL'; profile.policies.handle.redirectPolicy = 'DO_NOT_CREATE_REDIRECT'; }),
  ];
  for (const profile of invalid) assert.equal(publishingProfileDataSchema.safeParse(profile).success, false);
});

test('validation rejects incompatible managed, namespace, tag, collection and retry policies', () => {
  const invalid = [
    mutateProfile((profile) => { profile.policies.existingProductUpdateMode = 'FULL_MANAGED_UPDATE'; profile.policies.fieldPolicies = profile.policies.fieldPolicies.map(({ field }) => ({ field, policy: 'PRESERVE_EXISTING' })); }),
    mutateProfile((profile) => { profile.policies.metafields.namespacePolicy = 'APPROVED_NAMESPACES'; profile.policies.metafields.approvedNamespaces = []; }),
    mutateProfile((profile) => { profile.policies.metafields.namespacePolicy = 'APPROVED_NAMESPACES'; profile.policies.metafields.approvedNamespaces = ['Invalid Namespace']; }),
    mutateProfile((profile) => { profile.policies.tags.mode = 'REPLACE_AFTER_EXPLICIT_APPROVAL'; profile.policies.tags.removal = 'NEVER_REMOVE'; }),
    mutateProfile((profile) => { profile.policies.collections.mode = 'MANAGE_APPROVED_COLLECTION_ASSIGNMENTS'; profile.policies.approval.requirements.collectionChanges = false; }),
    mutateProfile((profile) => { profile.policies.failure.retry = 'NO_AUTOMATIC_RETRY'; profile.policies.failure.uncertainState = 'RETRY_IF_CONFIRMED_IDEMPOTENT'; }),
  ];
  for (const profile of invalid) assert.equal(publishingProfileDataSchema.safeParse(profile).success, false);
});

test('valid advanced manual profile is accepted without enabling automatic execution', () => {
  const profile = mutateProfile((value) => {
    value.policies.newProductStatus = 'ACTIVE_AFTER_APPROVAL';
    value.policies.existingProductUpdateMode = 'FULL_MANAGED_UPDATE';
    value.policies.fieldPolicies = value.policies.fieldPolicies.map((entry) => entry.field === 'TITLE' ? { ...entry, policy: 'MANAGED_BY_LISTINGPILOT' } : entry);
    value.policies.variants.deletion = 'DELETE_AFTER_EXPLICIT_APPROVAL';
    value.policies.images.deletion = 'DELETE_AFTER_EXPLICIT_APPROVAL';
    value.policies.inventory.policy = 'UPDATE_AFTER_EXPLICIT_APPROVAL';
  });
  assert.equal(publishingProfileDataSchema.safeParse(profile).success, true);
  assert.equal(profile.policies.approval.explicitMerchantActionRequired, true);
});

test('resolver applies merchant intent and Catalog Profile Brand/Vendor safety constraints', () => {
  const profile = mutateProfile((value) => { value.policies.brandVendor.policy = 'MAP_BRAND_TO_VENDOR'; value.policies.tags.normalization = 'NORMALIZE_APPROVED_TAGS'; });
  const registry = createMerchantPreferenceRegistry();
  const domain = createMerchantBusinessProfile(record(section(profile)), registry);
  const effective = resolveEffectiveMerchantPreferences(workspaceId, domain, registry);
  assert.equal(effective.publishing.policies.brandVendor.policy, 'REQUIRE_REVIEW');
  assert.equal(effective.publishing.catalogBrandVendorConstraintApplied, true);
  assert.equal(effective.publishing.policies.tags.normalization, 'NORMALIZE_APPROVED_TAGS');
  assert.equal(effective.publishing.sourceByPolicyGroup.tags, 'MANUAL');
});

test('missing and corrupted profiles safely resolve to immutable defaults', () => {
  const registry = createMerchantPreferenceRegistry();
  const missing = resolveEffectivePublishingProfile(null, registry);
  const corrupted = resolveEffectivePublishingProfile(createMerchantBusinessProfile(record(section({ broken: true } as never)), registry), registry);
  assert.equal(missing.merchantConfigured, false);
  assert.equal(missing.policies.inventory.policy, 'NEVER_UPDATE_INVENTORY');
  assert.equal(corrupted.validationStatus, 'INVALID');
  assert.equal(corrupted.policies.newProductStatus, 'DRAFT');
  assert.equal(Object.isFrozen(missing), true);
  assert.equal(missing.fingerprint, resolveEffectivePublishingProfile(null, registry).fingerprint);
});

test('completion and registry retain Publishing before the active AI section', () => {
  const registry = createMerchantPreferenceRegistry();
  assert.deepEqual(registry.activeSectionIds(), ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  const completion = evaluateMerchantBusinessProfileCompletion(createMerchantBusinessProfile(record(section()), registry), registry);
  assert.equal(completion.publishingComplete, true);
  assert.equal(completion.incompleteRequiredSections.includes('publishing'), false);
  assert.equal(evaluateMerchantBusinessProfileCompletion(null, registry).nextRequiredSection, 'catalog');
});

test('PublishingPolicyContext is pure, immutable and defaults missing profiles safely', () => {
  const context = createPublishingPolicyContext();
  assert.equal(context.productStatusPolicy, 'DRAFT');
  assert.equal(context.inventoryPolicy.policy, 'NEVER_UPDATE_INVENTORY');
  assert.equal(context.variantPolicy.deletion, 'NEVER_DELETE');
  assert.equal(context.imagePolicy.deletion, 'NEVER_DELETE');
  assert.equal(context.categoryPackAbsenceBlocks, false);
  assert.equal(context.blockerPolicy.find(({ condition }) => condition === 'CRITICAL_PRODUCT_TRUTH_CONFLICT')?.outcome, 'BLOCK');
  assert.equal(context.shopifyMutationAllowed, false);
  assert.equal(Object.isFrozen(context), true);
});

test('publishing audit events are specific, bounded and payload-free', () => {
  const event = preferenceSectionAuditEvent({ sectionId: 'publishing', source: 'MANUAL', previousVersion: null, newVersion: 1, status: 'COMPLETE', changedFields: ['approval', 'inventory'], publishingEvent: 'CREATED', publishingMetadata: { setupMode: 'LISTINGPILOT_SAFE_DEFAULTS', analysisStatus: 'NOT_REQUIRED', completionStatus: 'COMPLETE' } });
  assert.equal(event.action, 'publishing_profile.created');
  assert.deepEqual(event.metadata.changedFields, ['approval', 'inventory']);
  assert.doesNotMatch(JSON.stringify(event), /accessToken|product data|fieldPolicies|approvedNamespaces/i);
  assert.equal(preferenceSectionAuditEvent({ sectionId: 'publishing', source: 'MANUAL', previousVersion: 1, newVersion: 2, status: 'COMPLETE', publishingEvent: 'REVIEW_REQUESTED' }).action, 'publishing_profile.review_requested');
});

test('serialization is stable and unsupported versions fail explicitly', () => {
  const profile = createPublishingProfile('MANUAL');
  assert.deepEqual(publishingPreferenceSectionDefinition.deserialize(publishingPreferenceSectionDefinition.serialize(profile)), profile);
  assert.throws(() => publishingPreferenceSectionDefinition.migrate({}, 2), /unsupported/i);
});

test('Publishing Profile and adapter contain no Shopify, generation, network or database mutation', () => {
  const files = ['publishing-profile.ts', 'effective-publishing-profile.ts', 'publishing-policy-context.ts'];
  const source = files.map((file) => readFileSync(`${root}/src/modules/merchant-preferences/${file}`, 'utf8')).join('\n');
  assert.doesNotMatch(source, /\.(?:productCreate|productUpdate|metafieldsSet|publishablePublish|fileCreate)\b|prisma\.|fetch\(|openai|generateListing|generateSeo/i);
});

test('onboarding route requires authentication, OWNER writes, concurrency and safe responses', () => {
  const route = readFileSync(`${root}/src/app/api/onboarding/publishing-profile/route.ts`, 'utf8');
  const errors = readFileSync(`${root}/src/modules/onboarding/publishing-profile/route-errors.server.ts`, 'utf8');
  assert.match(route, /getCurrentUser/);
  assert.match(route, /resolveMerchantListingProfileAccess\(user\.id, input\.workspaceId, true\)/);
  assert.match(route, /expectedVersion/);
  assert.match(route, /getMerchantPublishingProfileView/);
  assert.match(errors, /error\.statusCode/);
  assert.doesNotMatch(`${route}\n${errors}`, /accessTokenEncrypted|productCreate|productUpdate|metafieldsSet/);
});

test('onboarding progresses from SEO to Publishing and contains no publish action', () => {
  const seoForm = readFileSync(`${root}/src/modules/onboarding/seo-profile/MerchantSeoProfileForm.tsx`, 'utf8');
  const form = readFileSync(`${root}/src/modules/onboarding/publishing-profile/MerchantPublishingProfileForm.tsx`, 'utf8');
  const gate = readFileSync(`${root}/src/modules/onboarding/catalog-profile/onboarding-gate.server.ts`, 'utf8');
  const navigation = readFileSync(`${root}/src/modules/settings/business-profile/routes.ts`, 'utf8');
  assert.match(seoForm, /merchantProfileSaveDestination/);
  assert.match(navigation, /onboarding\/publishing-profile/);
  assert.match(form, /Safe Defaults/);
  assert.match(form, /Pending analysis/);
  assert.match(form, /Configure Manually/);
  assert.match(form, /merchantProfileSaveDestination/);
  assert.match(navigation, /onboarding\/ai-profile/);
  assert.doesNotMatch(form, />Publish(?:<|\s)/);
  assert.match(gate, /publishingComplete/);
});
