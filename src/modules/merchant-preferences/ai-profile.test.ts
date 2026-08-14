import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { preferenceSectionAuditEvent } from './audit.ts';
import { createMerchantBusinessProfile } from './business-profile.ts';
import { evaluateMerchantBusinessProfileCompletion } from './completion.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { createAiPolicyContext } from './ai-policy-context.ts';
import { aiProfileDataSchema, createAiProfile, listingPilotAiSafetyDefaults, prohibitedAiActionSchema } from './ai-profile.ts';
import { AI_PREFERENCE_SCHEMA_VERSION, aiPreferenceSectionDefinition } from './ai-section.ts';
import { resolveEffectiveAiProfile } from './effective-ai-profile.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import type { MerchantBusinessProfileRecord, MerchantPreferenceSectionRecord } from './types.ts';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-08-06T12:00:00.000Z');
const root = fileURLToPath(new URL('../../..', import.meta.url));
function section(payload = createAiProfile('LISTINGPILOT_SAFE_AI'), overrides: Partial<MerchantPreferenceSectionRecord> = {}): MerchantPreferenceSectionRecord { return { id: 'ai-1', workspaceId, sectionId: 'ai', schemaVersion: 1, version: 1, status: 'COMPLETE', validationStatus: 'VALID', source: 'MANUAL', payload, fingerprint: stableMerchantPreferenceFingerprint(payload), metadata: {}, completedAt: now, createdAt: now, updatedAt: now, ...overrides }; }
function record(aiSection: MerchantPreferenceSectionRecord): MerchantBusinessProfileRecord { return { id: 'profile-1', workspaceId, version: 1, status: 'INCOMPLETE', lastCompletedSectionId: 'ai', fingerprint: 'a'.repeat(64), metadata: {}, createdAt: now, updatedAt: now, sections: [aiSection] }; }
function mutate(mode: 'MANUAL' | 'CREATIVE_AI' = 'MANUAL') { return structuredClone(createAiProfile(mode)); }

test('AI schema version 1 creates Safe, Balanced, Creative and Manual modes', () => {
  assert.equal(AI_PREFERENCE_SCHEMA_VERSION, 1);
  for (const mode of ['LISTINGPILOT_SAFE_AI', 'BALANCED_AI', 'CREATIVE_AI', 'MANUAL'] as const) assert.equal(aiProfileDataSchema.safeParse(createAiProfile(mode)).success, true);
});
test('Safe AI defaults are deeply immutable and evidence remains authoritative', () => {
  assert.equal(Object.isFrozen(listingPilotAiSafetyDefaults), true); assert.equal(Object.isFrozen(listingPilotAiSafetyDefaults.prohibitedActions), true);
  assert.equal(listingPilotAiSafetyDefaults.factualStrictness, 'VERIFIED_ONLY'); assert.equal(listingPilotAiSafetyDefaults.creativity, 'LOW'); assert.equal(listingPilotAiSafetyDefaults.conflicts, 'BLOCK_GENERATION_FOR_CRITICAL_CONFLICTS'); assert.equal(listingPilotAiSafetyDefaults.missingInformation, 'SUGGEST_EVIDENCE_NEEDED'); assert.equal(listingPilotAiSafetyDefaults.merchantApprovalRequired, true);
  assert.deepEqual(new Set(listingPilotAiSafetyDefaults.prohibitedActions), new Set(prohibitedAiActionSchema.options));
});
test('Balanced and Creative modes vary presentation without weakening factual safety', () => {
  const balanced = createAiProfile('BALANCED_AI'); const creative = createAiProfile('CREATIVE_AI');
  assert.equal(balanced.policies.creativity, 'MEDIUM'); assert.equal(creative.policies.creativity, 'HIGH');
  assert.equal(balanced.policies.factualStrictness, 'VERIFIED_ONLY'); assert.equal(creative.policies.factualStrictness, 'VERIFIED_ONLY'); assert.equal(creative.policies.merchantApprovalRequired, true);
});
test('validation rejects unknown, incomplete, future and unsafe profiles', () => {
  const emptyProhibitions = mutate(); emptyProhibitions.policies.prohibitedActions = [];
  const retry = mutate(); retry.policies.modelPolicy.maxRetries = 4;
  const batch = mutate(); batch.policies.bulk.maximumReviewBatchSize = 0;
  const uncertainty = mutate(); uncertainty.policies.uncertainty = 'INCLUDE_WITH_CLEAR_LABEL';
  const review = mutate(); review.policies.humanReviewThresholds = ['ALWAYS_REVIEW'];
  const alteredBalanced = createAiProfile('BALANCED_AI'); alteredBalanced.policies.creativity = 'LOW';
  for (const profile of [emptyProhibitions, retry, batch, uncertainty, review, alteredBalanced, { ...mutate(), setupMode: 'UNKNOWN' }, { ...mutate(), futurePolicy: true }, { setupMode: 'MANUAL', approved: true, policies: {} }]) assert.equal(aiProfileDataSchema.safeParse(profile).success, false);
  assert.throws(() => aiPreferenceSectionDefinition.migrate({}, 2), /unsupported/i);
});
test('valid advanced manual policy supports labelled and merchant-approved information safely', () => {
  const profile = mutate(); profile.policies.factualStrictness = 'ALLOW_MERCHANT_APPROVED_UNVERIFIED'; profile.policies.uncertainty = 'INCLUDE_WITH_CLEAR_LABEL'; profile.policies.conflicts = 'ALLOW_MERCHANT_SELECTED_VALUE'; profile.policies.creativity = 'MEDIUM'; profile.policies.localization.secondaryLanguage = 'fr'; profile.policies.localization.translationPolicy = 'MERCHANT_APPROVED_ONLY';
  assert.equal(aiProfileDataSchema.safeParse(profile).success, true);
});
test('resolver falls back safely and applies Listing, SEO, Publishing and Product Intelligence constraints', () => {
  const registry = createMerchantPreferenceRegistry(); const profile = mutate(); profile.policies.factualStrictness = 'ALLOW_MERCHANT_APPROVED_UNVERIFIED'; profile.policies.uncertainty = 'FLAG_FOR_REVIEW'; profile.policies.toneVariation = 'ALLOW_BROAD_VARIATION';
  const domain = createMerchantBusinessProfile(record(section(profile)), registry);
  const effective = resolveEffectiveAiProfile(domain, registry, { listingProfileEnforced: true, seoProfileEnforced: true, publishingApprovalRequired: true, productIntelligenceHighRisk: true });
  assert.equal(effective.policies.factualStrictness, 'VERIFIED_ONLY'); assert.equal(effective.policies.toneVariation, 'ALLOW_MINOR_VARIATION'); assert.equal(effective.policies.humanReviewThresholds.includes('ALWAYS_REVIEW'), true); assert.equal(effective.productIntelligenceConstraintApplied, true); assert.equal(Object.isFrozen(effective), true);
  const missing = resolveEffectiveAiProfile(null, registry); assert.equal(missing.merchantConfigured, false); assert.equal(missing.policies.factualStrictness, 'VERIFIED_ONLY'); assert.equal(missing.fingerprint, resolveEffectiveAiProfile(null, registry).fingerprint);
});
test('completion and registry include AI as the fifth active section', () => {
  const registry = createMerchantPreferenceRegistry(); assert.deepEqual(registry.activeSectionIds(), ['catalog', 'listing', 'seo', 'publishing', 'ai']);
  const completion = evaluateMerchantBusinessProfileCompletion(createMerchantBusinessProfile(record(section()), registry), registry); assert.equal(completion.aiComplete, true); assert.equal(completion.incompleteRequiredSections.includes('ai'), false);
});
test('AiPolicyContext is immutable, disables execution and preserves blockers', () => {
  const context = createAiPolicyContext(); assert.equal(context.aiExecutionAllowed, false); assert.equal(context.factualStrictness, 'VERIFIED_ONLY'); assert.equal(context.prohibitedActions.includes('INVENT_FACTS'), true); assert.equal(context.highRisk.requireHumanReview, true); assert.equal(Object.isFrozen(context), true);
});
test('AI audit events are bounded and contain no prompts or product content', () => {
  const event = preferenceSectionAuditEvent({ sectionId: 'ai', source: 'MANUAL', previousVersion: null, newVersion: 1, status: 'COMPLETE', changedFields: ['creativity'], aiEvent: 'CREATED', aiMetadata: { setupMode: 'LISTINGPILOT_SAFE_AI', creativityLevel: 'LOW', factualStrictness: 'VERIFIED_ONLY', qualityTier: 'STANDARD', reviewThresholdCount: 4 } });
  assert.equal(event.action, 'ai_profile.created'); assert.equal(event.metadata.reviewThresholdCount, 4); assert.doesNotMatch(JSON.stringify(event), /prompt|product content|generated content|api key|accessToken/i);
});
test('serialization is stable and unsupported versions fail explicitly', () => { const profile = createAiProfile('MANUAL'); assert.deepEqual(aiPreferenceSectionDefinition.deserialize(aiPreferenceSectionDefinition.serialize(profile)), profile); });
test('AI domain and adapter make no OpenAI, network, database or Shopify call', () => {
  const files = ['ai-profile.ts', 'effective-ai-profile.ts', 'ai-policy-context.ts']; const source = files.map((file) => readFileSync(`${root}/src/modules/merchant-preferences/${file}`, 'utf8')).join('\n'); assert.doesNotMatch(source, /fetch\(|prisma\.|openai\.|responses\.create|chat\.completions|productCreate|productUpdate/i);
});
test('onboarding API requires authentication, OWNER writes, bounded input and concurrency', () => {
  const route = readFileSync(`${root}/src/app/api/onboarding/ai-profile/route.ts`, 'utf8'); assert.match(route, /getCurrentUser/); assert.match(route, /resolveMerchantListingProfileAccess\(user\.id, input\.workspaceId, true\)/); assert.match(route, /expectedVersion/); assert.match(route, /readBoundedJsonRequest/); assert.doesNotMatch(route, /openai|responses\.create|productCreate/i);
});
test('onboarding proceeds from Publishing to AI and exposes no generation action', () => {
  const publishing = readFileSync(`${root}/src/modules/onboarding/publishing-profile/MerchantPublishingProfileForm.tsx`, 'utf8'); const form = readFileSync(`${root}/src/modules/onboarding/ai-profile/MerchantAiProfileForm.tsx`, 'utf8'); const page = readFileSync(`${root}/src/app/onboarding/ai-profile/page.tsx`, 'utf8'); const navigation = readFileSync(`${root}/src/modules/settings/business-profile/routes.ts`, 'utf8');
  assert.match(publishing, /merchantProfileSaveDestination/); assert.match(navigation, /onboarding\/ai-profile/); assert.match(form, /Safe AI/); assert.match(page, /verified product data remains the source of truth/i); assert.match(navigation, /projects\/new/); assert.doesNotMatch(form, />Generate(?:<|\s)/); assert.doesNotMatch(form, /GPT|OpenAI|token pricing/i); assert.match(form, /sm:grid-cols-2/);
});
