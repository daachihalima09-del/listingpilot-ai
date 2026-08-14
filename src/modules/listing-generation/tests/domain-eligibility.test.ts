import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { createListingGenerationPlan, parseListingGenerationPlan } from '../index.ts';
import { generationInput, finding, truthFindings } from './fixtures.ts';

test('creates a deeply immutable JSON-safe versioned READY plan', () => {
  const plan = createListingGenerationPlan(generationInput());
  assert.equal(plan.schemaVersion, 1); assert.equal(plan.planVersion, '1.0.0'); assert.equal(plan.composerVersion, '1.0.0'); assert.equal(plan.generationStatus, 'READY'); assert.equal(plan.generationEligibility.allowed, true); assert.equal(plan.aiPolicy.aiExecutionRequested, false); assert.equal(plan.aiPolicy.futureExecutionAllowed, true);
  assert.equal(Object.isFrozen(plan), true); assert.equal(Object.isFrozen(plan.selectedFacts), true); assert.equal(JSON.parse(JSON.stringify(plan)).planFingerprint, plan.planFingerprint);
  assert.deepEqual(parseListingGenerationPlan(JSON.parse(JSON.stringify(plan))), plan);
});
test('fingerprint ignores timestamps and input ordering but tracks semantic changes', () => {
  const findings = truthFindings(); const left = createListingGenerationPlan(generationInput({ findings })); const right = createListingGenerationPlan(generationInput({ findings: [...findings].reverse(), mutate: (input) => (input as { snapshotCreatedAt: string }).snapshotCreatedAt = '2026-08-08T00:00:00.000Z' }));
  assert.equal(left.planFingerprint, right.planFingerprint); assert.notEqual(left.createdAt, right.createdAt);
  const changed = createListingGenerationPlan(generationInput({ mutate: (input) => (input as { sourceFingerprint: string }).sourceFingerprint = 'changed' })); assert.notEqual(left.planFingerprint, changed.planFingerprint);
});
test('compatibility parser fails safely for future versions and invalid structures', () => {
  const plan = createListingGenerationPlan(generationInput());
  assert.throws(() => parseListingGenerationPlan({ ...plan, schemaVersion: 2 }), (error: unknown) => (error as { code?: string }).code === 'UNSUPPORTED_PLAN_VERSION');
  assert.throws(() => parseListingGenerationPlan({ ...plan, titlePlan: null }), (error: unknown) => (error as { code?: string }).code === 'INVALID_GENERATION_INPUT');
  assert.equal(parseListingGenerationPlan(plan).projectId, plan.projectId);
});
test('eligibility distinguishes warnings, review, insufficient data, blocking and invalid configuration', () => {
  const warning = createListingGenerationPlan(generationInput({ pack: null })); assert.equal(warning.generationStatus, 'READY_WITH_WARNINGS'); assert.equal(warning.warnings[0]?.code, 'MISSING_PRODUCT_INTELLIGENCE_PACK');
  const likely = createListingGenerationPlan(generationInput({ findings: [...truthFindings(), finding('material', 'Aluminium', 'LIKELY')], mutate: (input) => (input.aiPolicy as { factualStrictness: string }).factualStrictness = 'VERIFIED_AND_LIKELY_WITH_LABEL' })); assert.equal(likely.generationStatus, 'READY_WITH_WARNINGS'); assert.equal(likely.generationEligibility.allowed, true);
  const missing = generationInput({ mutate: (input) => (input.productIntelligence.analysis!.categoryRequirements as unknown as { missingIdentityFields: string[] }).missingIdentityFields = ['model'] }); assert.equal(createListingGenerationPlan(missing).generationStatus, 'INSUFFICIENT_DATA');
  const conflict = finding('model', 'X2000', 'CONFLICTED', { importance: 'CRITICAL' }); assert.equal(createListingGenerationPlan(generationInput({ findings: [...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'), conflict] })).generationStatus, 'BLOCKED');
  const invalid = generationInput({ mutate: (input) => (input.merchantPreferences.catalog as { complete: boolean }).complete = false }); assert.equal(createListingGenerationPlan(invalid).generationStatus, 'INVALID_CONFIGURATION');
});
test('blocks ambiguous identity, stale projects, publishing blocks and unsafe AI policies', () => {
  const ambiguous = generationInput({ mutate: (input) => (input.productIntelligence.analysis!.categoryDetection as { status: string }).status = 'AMBIGUOUS' }); assert.equal(createListingGenerationPlan(ambiguous).blockers.some(({ code }) => code === 'AMBIGUOUS_PRODUCT_IDENTITY'), true);
  const stale = generationInput({ mutate: (input) => (input.project as { expectedVersion: number }).expectedVersion = 2 }); assert.equal(createListingGenerationPlan(stale).blockers.some(({ code }) => code === 'STALE_PROJECT_VERSION'), true);
  const publishing = generationInput({ pack: null, mutate: (input) => { const entry = input.publishingPolicy.blockerPolicy.find(({ condition }) => condition === 'MISSING_PRODUCT_INTELLIGENCE_PACK')!; (entry as { outcome: string }).outcome = 'BLOCK'; } }); assert.equal(createListingGenerationPlan(publishing).blockers.some(({ code }) => code === 'PUBLISHING_POLICY_BLOCK'), true);
  const ai = generationInput({ mutate: (input) => (input.aiPolicy as { prohibitedActions: string[] }).prohibitedActions = input.aiPolicy.prohibitedActions.filter((value) => value !== 'INVENT_FACTS') }); assert.equal(createListingGenerationPlan(ai).blockers.some(({ code }) => code === 'AI_POLICY_BLOCK'), true);
});
test('locked-content conflicts require review without removing the lock', () => {
  const lock = { field: 'model', valueFingerprint: new DeterministicHasher().hash('Different model'), lockSource: 'MERCHANT_APPROVAL', lockedBy: 'user-1', lockedAt: '2026-08-07T00:00:00.000Z', reason: 'Approved content', overrideAllowed: false } as const;
  const plan = createListingGenerationPlan(generationInput({ lockedFields: [lock] })); assert.equal(plan.blockers.some(({ code }) => code === 'LOCKED_CONTENT_CONFLICT'), true); assert.deepEqual(plan.lockedFields, [lock]);
});
test('expected product problems become blockers rather than uncaught exceptions', () => {
  const input = generationInput({ mutate: (value) => (value.project as { status: string }).status = 'ARCHIVED' }); const plan = createListingGenerationPlan(input); assert.equal(plan.generationStatus, 'BLOCKED'); assert.equal(plan.blockers.some(({ code }) => code === 'CORRUPTED_PROJECT_STATE'), true);
});
