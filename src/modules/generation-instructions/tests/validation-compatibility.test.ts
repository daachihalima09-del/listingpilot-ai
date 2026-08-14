import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { finding, generationInput, truthFindings } from '../../listing-generation/tests/fixtures.ts';
import {
  createGenerationInstructions,
  generationInstructionFingerprint,
  parseGenerationInstructions,
  semanticGenerationInstructionValue,
  validateGenerationInstructionsAgainstPlan,
  type GenerationInstructions,
} from '../index.ts';

type MutableGroupName = 'TITLE' | 'DESCRIPTION' | 'FEATURES' | 'SEO' | 'CATALOG' | 'METAFIELDS' | 'MEDIA' | 'LOCALIZATION';
interface MutableGroup { factIds: string[]; }
interface MutableSafety {
  prohibitedOutputs: string[];
  reviewRequirements: Array<{ relatedFactIds: string[] }>;
  merchantLocks: Array<Record<string, unknown>>;
}
interface MutableInstructionPackage {
  instructionFingerprint: string;
  instructionId: string;
  createdAt: string;
  schemaVersion: number;
  allowedFacts: Array<{ factId: string }>;
  groups: Record<MutableGroupName, MutableGroup> & { SAFETY: MutableSafety };
  metadata: {
    selectedFactCount: number;
    reviewRequirementCount: number;
    merchantLockCount: number;
    prohibitedOutputCount: number;
  };
}

function mutableInstructions(value: GenerationInstructions): MutableInstructionPackage {
  return JSON.parse(JSON.stringify(value)) as MutableInstructionPackage;
}

function resign(value: MutableInstructionPackage): MutableInstructionPackage {
  const fingerprint = generationInstructionFingerprint(semanticGenerationInstructionValue(
    value as unknown as GenerationInstructions,
  ));
  value.instructionFingerprint = fingerprint;
  value.instructionId = `generation_instructions_${fingerprint}`;
  return value;
}

test('fingerprints are deterministic and ignore instruction identity and creation time', () => {
  const plan = createListingGenerationPlan(generationInput());
  const left = createGenerationInstructions(plan);
  const right = createGenerationInstructions(plan);
  assert.equal(left.instructionFingerprint, right.instructionFingerprint);
  const changed = mutableInstructions(left);
  changed.createdAt = '2026-09-01T00:00:00.000Z';
  changed.instructionId = 'temporary';
  assert.equal(
    generationInstructionFingerprint(semanticGenerationInstructionValue(changed as unknown as GenerationInstructions)),
    left.instructionFingerprint,
  );
});

test('rejects forbidden facts even when a tampered package is re-fingerprinted', () => {
  const plan = createListingGenerationPlan(generationInput({
    findings: [...truthFindings(), finding('material', 'Likely aluminium', 'LIKELY')],
  }));
  const forbiddenId = plan.excludedFacts.find(({ fieldId }) => fieldId === 'material')!.id;
  const tampered = mutableInstructions(createGenerationInstructions(plan));
  tampered.groups.TITLE.factIds.push(forbiddenId);
  resign(tampered);
  assert.throws(
    () => validateGenerationInstructionsAgainstPlan(tampered, plan),
    (error: unknown) => (error as { code?: string }).code === 'FORBIDDEN_FACT_PROJECTED',
  );
});

test('rejects removed selected facts, prohibitions, reviews and merchant locks', () => {
  const lock = {
    field: 'model',
    valueFingerprint: new DeterministicHasher().hash('Different model'),
    lockSource: 'MERCHANT_APPROVAL',
    lockedBy: 'user-1',
    lockedAt: '2026-08-07T00:00:00.000Z',
    reason: 'Merchant approved',
    overrideAllowed: false,
  } as const;
  const plan = createListingGenerationPlan(generationInput({ lockedFields: [lock] }));
  const base = createGenerationInstructions(plan);

  const missingFact = mutableInstructions(base);
  const removedFact = missingFact.allowedFacts.pop();
  assert.ok(removedFact);
  const removedFactId = removedFact.factId;
  for (const name of ['TITLE', 'DESCRIPTION', 'FEATURES', 'SEO', 'CATALOG', 'METAFIELDS', 'MEDIA', 'LOCALIZATION'] as const) {
    const instructionGroup = missingFact.groups[name];
    instructionGroup.factIds = instructionGroup.factIds.filter((id) => id !== removedFactId);
  }
  for (const requirement of missingFact.groups.SAFETY.reviewRequirements) {
    requirement.relatedFactIds = requirement.relatedFactIds.filter((id: string) => id !== removedFactId);
  }
  missingFact.metadata.selectedFactCount = missingFact.allowedFacts.length;
  resign(missingFact);
  assert.throws(() => validateGenerationInstructionsAgainstPlan(missingFact, plan),
    (error: unknown) => (error as { code?: string }).code === 'MISSING_SELECTED_FACT');

  const missingProhibition = mutableInstructions(base);
  missingProhibition.groups.SAFETY.prohibitedOutputs.pop();
  missingProhibition.metadata.prohibitedOutputCount = missingProhibition.groups.SAFETY.prohibitedOutputs.length;
  resign(missingProhibition);
  assert.throws(() => validateGenerationInstructionsAgainstPlan(missingProhibition, plan),
    (error: unknown) => (error as { code?: string }).code === 'MISSING_PROHIBITED_OUTPUT');

  const missingReview = mutableInstructions(base);
  missingReview.groups.SAFETY.reviewRequirements.pop();
  missingReview.metadata.reviewRequirementCount = missingReview.groups.SAFETY.reviewRequirements.length;
  resign(missingReview);
  assert.throws(() => validateGenerationInstructionsAgainstPlan(missingReview, plan),
    (error: unknown) => (error as { code?: string }).code === 'MISSING_REVIEW_REQUIREMENT');

  const missingLock = mutableInstructions(base);
  missingLock.groups.SAFETY.merchantLocks = [];
  missingLock.metadata.merchantLockCount = 0;
  resign(missingLock);
  assert.throws(() => validateGenerationInstructionsAgainstPlan(missingLock, plan),
    (error: unknown) => (error as { code?: string }).code === 'MISSING_MERCHANT_LOCK');
});

test('compatibility parsing rejects malformed, tampered and future packages safely', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  assert.throws(() => parseGenerationInstructions({ ...instructions, groups: null }),
    (error: unknown) => (error as { code?: string }).code === 'INVALID_INSTRUCTION_PACKAGE');
  assert.throws(() => parseGenerationInstructions({ ...instructions, instructionFingerprint: 'tampered' }),
    (error: unknown) => (error as { code?: string }).code === 'FINGERPRINT_MISMATCH');
  const future = mutableInstructions(instructions);
  future.schemaVersion = 2;
  resign(future);
  assert.throws(() => parseGenerationInstructions(future),
    (error: unknown) => (error as { code?: string }).code === 'UNSUPPORTED_INSTRUCTION_VERSION');
});
