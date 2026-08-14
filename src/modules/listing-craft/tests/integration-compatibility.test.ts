import assert from 'node:assert/strict';
import test from 'node:test';
import { createGenerationInstructions, parseGenerationInstructions } from '../../generation-instructions/index.ts';
import { generationInstructionFingerprint, semanticGenerationInstructionValue } from '../../generation-instructions/builder/instruction-fingerprint.ts';
import { ListingDraftEngine } from '../../listing-draft/builder/draft-engine.ts';
import { validProviderOutput } from '../../listing-draft/tests/fixtures.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { generationInput } from '../../listing-generation/tests/fixtures.ts';

test('NEOVIX instructions carry bounded Craft metadata and safe provenance while other standards remain unchanged', () => {
  const neovix = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const marketplace = createGenerationInstructions(createListingGenerationPlan(generationInput({ listingStandard: 'MARKETPLACE' })));
  assert.equal(neovix.craft?.packId, 'neovix');
  assert.equal(neovix.craft?.packVersion, '1.2.0');
  assert.equal(neovix.allowedFacts[0]?.sourceAuthority?.displayLabel, 'Official Technical Specification');
  assert.equal(marketplace.craft, undefined);
  assert.equal(JSON.stringify(neovix).includes('rawEvidence'), false);
});

test('Craft Pack semantics and version participate in the instruction fingerprint', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const changed = structuredClone(instructions);
  if (!changed.craft) throw new Error('Expected Craft metadata.');
  Object.assign(changed.craft, { packVersion: '1.0.1' });
  const changedFingerprint = generationInstructionFingerprint(semanticGenerationInstructionValue(changed));
  assert.notEqual(changedFingerprint, instructions.instructionFingerprint);
});

test('legacy instruction packages without Craft metadata remain parseable and immutable', () => {
  const current = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const legacy = structuredClone(current) as unknown as Record<string, unknown>;
  delete legacy.craft;
  const sourcePlan = legacy.sourcePlan as Record<string, unknown>;
  delete sourcePlan.listingStandardId;
  const fingerprint = generationInstructionFingerprint(semanticGenerationInstructionValue(legacy as never));
  legacy.instructionFingerprint = fingerprint;
  legacy.instructionId = `generation_instructions_${fingerprint}`;
  const parsed = parseGenerationInstructions(legacy);
  assert.equal(parsed.craft, undefined);
  assert.equal(Object.isFrozen(parsed), true);
});

test('draft generation persists Craft version, findings, explanations and safe source labels without publishing', async () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const draft = await new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: 'craft-request' }) },
    now: () => '2026-08-08T00:00:00.000Z',
  }).generate(instructions);
  assert.equal(draft.metadata.craftPackId, 'neovix');
  assert.equal(draft.reviewWorkspace?.craft?.packVersion, '1.2.0');
  assert.equal(draft.reviewWorkspace?.craft?.explanations.includes('NEOVIX Standard applied'), true);
  assert.equal(draft.reviewWorkspace?.facts.every(({ source }) => source === 'Official Technical Specification'), true);
  assert.equal(draft.status, 'GENERATED');
});
