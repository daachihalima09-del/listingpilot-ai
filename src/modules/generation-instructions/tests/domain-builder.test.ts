import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { finding, generationInput, truthFindings } from '../../listing-generation/tests/fixtures.ts';
import {
  createGenerationInstructions,
  parseGenerationInstructions,
} from '../index.ts';

test('creates a versioned, JSON-safe, deeply immutable instruction package', () => {
  const plan = createListingGenerationPlan(generationInput());
  const instructions = createGenerationInstructions(plan);
  assert.equal(instructions.schemaVersion, 1);
  assert.equal(instructions.instructionVersion, '1.0.0');
  assert.equal(instructions.builderVersion, '1.0.0');
  assert.equal(instructions.sourcePlan.planFingerprint, plan.planFingerprint);
  assert.equal(Object.isFrozen(instructions), true);
  assert.equal(Object.isFrozen(instructions.groups.SAFETY.prohibitedOutputs), true);
  assert.deepEqual(parseGenerationInstructions(JSON.parse(JSON.stringify(instructions))), instructions);
});

test('creates every independently reusable instruction group without generated content', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  assert.deepEqual(Object.keys(instructions.groups).sort(), [
    'CATALOG', 'DESCRIPTION', 'FEATURES', 'LOCALIZATION', 'MEDIA', 'METAFIELDS', 'SAFETY', 'SEO', 'TITLE',
  ]);
  for (const [name, instructionGroup] of Object.entries(instructions.groups)) {
    assert.equal(instructionGroup.group, name);
  }
  const serialized = JSON.stringify(instructions);
  assert.equal(serialized.includes('generatedText'), false);
  assert.equal(serialized.includes('prompt'), false);
});

test('projects selected facts while omitting excluded, unresolved and conflicted facts', () => {
  const facts = [
    ...truthFindings(),
    finding('material', 'Likely aluminium', 'LIKELY'),
    finding('warranty', 'Unsupported warranty', 'INSUFFICIENT_EVIDENCE'),
    finding('compatibility', 'Conflicted compatibility', 'CONFLICTED'),
  ];
  const plan = createListingGenerationPlan(generationInput({ findings: facts }));
  const instructions = createGenerationInstructions(plan);
  assert.deepEqual(
    instructions.allowedFacts.map(({ factId }) => factId).sort(),
    plan.selectedFacts.map(({ id }) => id).sort(),
  );
  const serialized = JSON.stringify(instructions);
  assert.equal(serialized.includes('Likely aluminium'), false);
  assert.equal(serialized.includes('Unsupported warranty'), false);
  assert.equal(serialized.includes('Conflicted compatibility'), false);
  assert.equal(serialized.includes('evidenceReferences'), false);
  assert.equal(serialized.includes('sourceReferences'), false);
});

test('distinguishes required-visible facts from optional verified context', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const required = instructions.allowedFacts.filter(({ visibilityRole }) => visibilityRole === 'REQUIRED_VISIBLE');
  const available = instructions.allowedFacts.filter(({ visibilityRole }) => visibilityRole === 'AVAILABLE_VERIFIED');
  assert.ok(required.length > 0);
  assert.ok(available.length > 0);
  assert.ok(required.every(({ requiredPlacements }) => requiredPlacements.length > 0));
  assert.ok(available.every(({ requiredPlacements }) => requiredPlacements.length === 0));
  assert.ok(required.some(({ fieldId, requiredPlacements }) => fieldId === 'model' && requiredPlacements.includes('TITLE')));
});

test('projects mandatory safety, reviews, merchant locks and publishing constraints', () => {
  const lock = {
    field: 'model',
    valueFingerprint: new DeterministicHasher().hash('Different model'),
    lockSource: 'MERCHANT_APPROVAL',
    lockedBy: 'private-user-id',
    lockedAt: '2026-08-07T00:00:00.000Z',
    reason: 'Merchant approved',
    overrideAllowed: false,
  } as const;
  const plan = createListingGenerationPlan(generationInput({ lockedFields: [lock] }));
  const safety = createGenerationInstructions(plan).groups.SAFETY;
  assert.deepEqual(safety.prohibitedOutputs, [...plan.prohibitedOutputs].sort());
  assert.deepEqual(safety.reviewRequirements.map(({ id }) => id), plan.reviewRequirements.map(({ id }) => id));
  assert.equal(safety.merchantLocks[0]?.valueFingerprint, lock.valueFingerprint);
  assert.equal('lockedBy' in safety.merchantLocks[0]!, false);
  assert.deepEqual(safety.publishingConstraints, plan.publishingConstraints);
  assert.equal(safety.factualStrictness, plan.aiPolicy.factualStrictness);
  assert.deepEqual(safety.requiredEvidenceBehavior, plan.aiPolicy.evidence);
  assert.equal(safety.uncertaintyBehavior, plan.aiPolicy.uncertainty);
  assert.equal(safety.missingDataBehavior, plan.aiPolicy.missingInformation);
});

test('catalog instructions expose approved values only and never request creation', () => {
  const plan = createListingGenerationPlan(generationInput({
    mutate: (input) => (input.product as { vendor?: string }).vendor = 'Unapproved Vendor',
  }));
  const instructions = createGenerationInstructions(plan).groups.CATALOG.instructions;
  assert.equal(JSON.stringify(instructions).includes('Unapproved Vendor'), false);
  assert.equal(instructions.automaticCreationAllowed, false);
  assert.equal('unapprovedValues' in instructions, false);
  assert.equal('creationRequests' in instructions, false);
});
