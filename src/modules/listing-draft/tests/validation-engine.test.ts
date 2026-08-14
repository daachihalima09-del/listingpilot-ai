import assert from 'node:assert/strict';
import test from 'node:test';
import { createGenerationInstructions } from '../../generation-instructions/index.ts';
import { factValueIsRepresented, unsupportedFactualTokens } from '../../generation-instructions/domain/fact-fidelity.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { finding, generationInput, truthFindings } from '../../listing-generation/tests/fixtures.ts';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { validateListingDraftOutput } from '../validation/draft-validator.ts';
import { draftInstructions, validProviderOutput } from './fixtures.ts';

test('validates a complete structured merchant draft and creates all review summaries', async () => {
  const instructions = draftInstructions();
  const output = validProviderOutput(instructions);
  const draft = await new ListingDraftEngine({
    provider: { generate: async () => ({ output, requestId: 'req_1' }) },
    now: () => '2026-08-08T00:00:00.000Z',
  }).generate(instructions);
  assert.equal(draft.title.value, output.title.value);
  assert.equal(draft.providerRequestId, 'req_1');
  assert.ok(draft.productTruthSummary.length > 0);
  assert.ok(draft.aiDetectiveSummary.length > 0);
  assert.equal(Object.isFrozen(draft), true);
});

test('rejects missing fields, forbidden facts, invented values and duplicate features', () => {
  const instructions = draftInstructions();
  const output = structuredClone(validProviderOutput(instructions));
  assert.throws(() => validateListingDraftOutput({ ...output, overview: undefined }, instructions), ListingDraftError);

  output.title.factIds = ['excluded-fact'];
  assert.throws(() => validateListingDraftOutput(output, instructions), (error: unknown) => (
    error instanceof ListingDraftError && error.code === 'DRAFT_FORBIDDEN_FACT'
  ));

  const invented = structuredClone(validProviderOutput(instructions));
  invented.features[0]!.value = 'Supports 9999 modes';
  assert.throws(() => validateListingDraftOutput(invented, instructions), (error: unknown) => (
    error instanceof ListingDraftError && error.code === 'DRAFT_INVENTED_VALUE'
  ));

  const uncited = structuredClone(validProviderOutput(instructions));
  uncited.features[0]!.factIds = [];
  assert.throws(() => validateListingDraftOutput(uncited, instructions), (error: unknown) => (
    error instanceof ListingDraftError
      && error.metadata.outputField === 'features.0'
      && error.metadata.reason === 'MISSING_FACT_REFERENCES'
  ));

  const duplicate = structuredClone(validProviderOutput(instructions));
  duplicate.features[1] = structuredClone(duplicate.features[0]!);
  assert.throws(() => validateListingDraftOutput(duplicate, instructions), ListingDraftError);
});

test('enforces title, SEO, prohibited wording and merchant-approved catalog values', () => {
  const instructions = draftInstructions();
  for (const mutate of [
    (value: ReturnType<typeof validProviderOutput>) => { value.title.value = 'x'.repeat(141); },
    (value: ReturnType<typeof validProviderOutput>) => { value.seo.title.value = 'x'.repeat(121); },
    (value: ReturnType<typeof validProviderOutput>) => { value.title.value = 'Perfect Acme Television'; },
    (value: ReturnType<typeof validProviderOutput>) => { value.catalog.vendor.value = 'Unapproved'; },
  ]) {
    const output = structuredClone(validProviderOutput(instructions));
    mutate(output);
    assert.throws(() => validateListingDraftOutput(output, instructions), ListingDraftError);
  }
});

test('available verified facts are optional and do not require fact stuffing', () => {
  const instructions = structuredClone(draftInstructions());
  const output = validProviderOutput(instructions);
  const template = instructions.allowedFacts[0]!;
  (instructions.allowedFacts as unknown as Array<typeof template>).push({
    ...template,
    factId: 'optional-unused-fact',
    fieldId: 'optional_finish',
    value: 'Satin nickel',
    allowedUses: ['DESCRIPTION', 'FEATURES'],
    visibilityRole: 'AVAILABLE_VERIFIED',
    requiredPlacements: [],
  });
  assert.equal(output.title.factIds.includes('optional-unused-fact'), false);
  assert.doesNotThrow(() => validateListingDraftOutput(output, instructions, { enforceListingStyle: false }));
});

test('required visible facts must appear in their required placement', () => {
  const instructions = draftInstructions();
  const required = instructions.allowedFacts.find(({ requiredPlacements }) => requiredPlacements.includes('STRUCTURED_DETAILS'))!;
  const output = structuredClone(validProviderOutput(instructions));
  output.specifications = output.specifications.filter(({ factIds }) => !factIds.includes(required.factId));
  assert.throws(() => validateListingDraftOutput(output, instructions, { enforceListingStyle: false }), (error: unknown) => (
    error instanceof ListingDraftError
      && error.code === 'DRAFT_POLICY_VIOLATION'
      && error.metadata.reason === 'REQUIRED_FACT_NOT_VISIBLE'
  ));
});

test('cited verified facts accept safe presentation wording but reject unused citations', () => {
  const instructions = draftInstructions();
  const brand = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  const paraphrased = structuredClone(validProviderOutput(instructions));
  paraphrased.whatsIncluded[0] = { value: `${brand.value} product package`, factIds: [brand.factId] };
  assert.doesNotThrow(() => validateListingDraftOutput(paraphrased, instructions, { enforceListingStyle: false }));

  const overCited = structuredClone(paraphrased);
  overCited.whatsIncluded[0]!.factIds.push(model.factId);
  assert.throws(() => validateListingDraftOutput(overCited, instructions, { enforceListingStyle: false }), (error: unknown) => (
    error instanceof ListingDraftError
      && error.code === 'DRAFT_INVENTED_VALUE'
      && error.metadata.reason === 'CITATION_NOT_REPRESENTED'
  ));
});

test('optional detail-rich facts are cited only when their material detail is visible', () => {
  const instructions = structuredClone(draftInstructions());
  const template = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const modes = { ...template, factId: 'operating-modes', fieldId: 'operating_modes', value: 'Auto, Night, Breeze and Oscillation modes', allowedUses: ['SEO'] as const, visibilityRole: 'AVAILABLE_VERIFIED' as const, requiredPlacements: [] };
  (instructions.allowedFacts as unknown as Array<typeof modes>).push(modes);
  const brand = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  const named = structuredClone(validProviderOutput(instructions));
  named.seo.description = { value: `${brand.value} ${model.value} supports Auto, Night, Breeze and Oscillation modes.`, factIds: [brand.factId, model.factId, modes.factId] };
  assert.doesNotThrow(() => validateListingDraftOutput(named, instructions, { enforceListingStyle: false }));
  const omitted = structuredClone(named);
  omitted.seo.description = { value: `${brand.value} ${model.value} uses smart controls and scheduling.`, factIds: [brand.factId, model.factId] };
  assert.doesNotThrow(() => validateListingDraftOutput(omitted, instructions, { enforceListingStyle: false }));
  const overCited = structuredClone(omitted);
  overCited.seo.description.factIds.push(modes.factId);
  assert.throws(() => validateListingDraftOutput(overCited, instructions, { enforceListingStyle: false }), (error: unknown) => error instanceof ListingDraftError && error.metadata.reason === 'CITATION_NOT_REPRESENTED');
});

test('safe compound-fact normalization preserves identity without requiring every descriptor', () => {
  const instructions = draftInstructions();
  const template = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const compound = { ...template, factId: 'smart-platform-fact', fieldId: 'smart_platform', value: 'MyDyson App with voice control compatibility', visibilityRole: 'AVAILABLE_VERIFIED' as const, requiredPlacements: [] };
  const adjusted = structuredClone(instructions);
  (adjusted.allowedFacts as unknown as Array<typeof compound>).push(compound);
  const output = structuredClone(validProviderOutput(adjusted));
  output.whatsIncluded[0] = { value: 'MyDyson app control', factIds: [compound.factId] };
  assert.doesNotThrow(() => validateListingDraftOutput(output, adjusted, { enforceListingStyle: false }));
});

test('a safe Dyson subclaim may omit other text and numeric claims bundled in Product Truth', () => {
  const instructions = draftInstructions();
  const template = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const waterTreatment = {
    ...template,
    factId: 'dyson-water-treatment',
    fieldId: 'water_treatment',
    value: 'Ultraviolet Cleanse Technology with a stated 99.9% bacteria-elimination claim',
    visibilityRole: 'AVAILABLE_VERIFIED' as const,
    requiredPlacements: [],
  };
  const adjusted = structuredClone(instructions);
  (adjusted.allowedFacts as unknown as Array<typeof waterTreatment>).push(waterTreatment);
  const output = structuredClone(validProviderOutput(adjusted));
  output.features[0] = { value: '\u2714 Ultraviolet Cleanse Technology treats the tank water', factIds: [waterTreatment.factId] };
  assert.doesNotThrow(() => validateListingDraftOutput(output, adjusted, { enforceListingStyle: false }));
});

test('safe unit, inflection and numeric typography variants stay grounded', () => {
  assert.equal(factValueIsRepresented('5-litre water tank', '5 L'), true);
  assert.equal(factValueIsRepresented('Supports air purification and humidification', 'Air purifier, humidifier and cooling fan'), true);
  assert.equal(factValueIsRepresented('Purifies, humidifies and cools', 'Air purifier, humidifier and cooling fan'), true);
  assert.equal(factValueIsRepresented('Connects over Wi-Fi', 'Wi-Fi connectivity'), true);
  assert.equal(factValueIsRepresented('Filters the air using HEPA filtration', 'HEPA filtration'), true);
  assert.deepEqual(unsupportedFactualTokens('Monitors NO2 and PM2.5', ['NO\u2082 and PM2.5 monitoring']), []);
  assert.deepEqual(unsupportedFactualTokens('4 L water tank', ['5 L']), ['4']);
  const realTitle = 'Dyson PH05 Air Purifier Humidifier And Cooling Fan 5L HEPA H13 Filtration Air Multiplier Technology';
  assert.deepEqual(unsupportedFactualTokens(realTitle, ['5 L', 'Dyson', 'PH05', 'Air purifier humidifier and cooling fan', 'HEPA H13 filtration', 'Air Multiplier technology']), []);
  assert.deepEqual(unsupportedFactualTokens('Dyson PH05 4L', ['Dyson', 'PH05', '5 L']), ['4']);
  assert.equal(factValueIsRepresented('65-inch display', '65 inch'), true);
  assert.equal(factValueIsRepresented('65" display', '65 inch'), true);
  assert.deepEqual(unsupportedFactualTokens('120Hz 1500W 10kg 500ml 0.1 µm', ['120 Hz', '1500 W', '10 kg', '500 ml', '0.1 microns']), []);
  assert.deepEqual(unsupportedFactualTokens('144Hz 1800W 75-inch', ['120 Hz', '1500 W', '65 inch']), ['144', '1800', '75']);
  assert.deepEqual(unsupportedFactualTokens('144Hz refresh rate', ['120 Hz refresh rate']), ['144']);
  assert.deepEqual(unsupportedFactualTokens('4L capacity', ['5 L capacity']), ['4']);
  assert.deepEqual(unsupportedFactualTokens('75-inch display', ['65 inch display']), ['75']);
});

test('natural grammatical claim expressions remain grounded while unsupported semantic claims fail', () => {
  assert.equal(factValueIsRepresented('Dyson PH05 purifies, humidifies and cools with fully sealed HEPA H13 filtration.', 'Air purifier, humidifier and cooling fan'), true);
  assert.equal(factValueIsRepresented('Dyson PH05 purifies, humidifies and cools with fully sealed HEPA H13 filtration.', 'HEPA H13 filtration'), true);
  assert.equal(factValueIsRepresented('Apple HomeKit control', 'Voice control'), false);
  assert.equal(factValueIsRepresented('Dyson V16 Wet And Dry Stick Vacuum', 'V16 Piston Animal Submarine'), true);
  assert.equal(factValueIsRepresented('Dyson V15 Wet And Dry Stick Vacuum', 'V16 Piston Animal Submarine'), false);
  assert.equal(factValueIsRepresented('TP10', 'TP12'), false);
});

test('wrong model, wrong numeric values and unsupported numeric claims remain rejected', () => {
  const instructions = draftInstructions();
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  const resolution = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'resolution')!;
  for (const item of [
    { value: 'TP10', factIds: [model.factId] },
    { value: '8K resolution', factIds: [resolution.factId] },
    { value: 'Wi-Fi 7 connectivity', factIds: [resolution.factId] },
  ]) {
    const output = structuredClone(validProviderOutput(instructions));
    output.features[0] = item;
    assert.throws(() => validateListingDraftOutput(output, instructions, { enforceListingStyle: false }), (error: unknown) => (
      error instanceof ListingDraftError && error.code === 'DRAFT_INVENTED_VALUE'
    ));
  }
});

test('conflicted or otherwise unapproved facts cannot be cited', () => {
  const instructions = draftInstructions();
  const output = structuredClone(validProviderOutput(instructions));
  output.features[0]!.factIds = ['conflicted-fact'];
  assert.throws(() => validateListingDraftOutput(output, instructions), (error: unknown) => (
    error instanceof ListingDraftError && error.code === 'DRAFT_FORBIDDEN_FACT'
  ));
});

test('blocked plans never call the provider and warning plans retain review warnings', async () => {
  const blocked = createGenerationInstructions(createListingGenerationPlan(generationInput({
    findings: [
      ...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'),
      finding('model', 'Conflicted model', 'CONFLICTED', { importance: 'CRITICAL' }),
    ],
  })));
  let called = false;
  await assert.rejects(
    new ListingDraftEngine({ provider: { generate: async () => { called = true; return { output: validProviderOutput(blocked), requestId: null }; } } }).generate(blocked),
    (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_GENERATION_BLOCKED',
  );
  assert.equal(called, false);

  const warning = structuredClone(draftInstructions());
  (warning.sourcePlan as { generationStatus: string }).generationStatus = 'READY_WITH_WARNINGS';
  const draft = await new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(warning), requestId: null }) },
  }).generate(warning);
  assert.ok(draft.warnings.includes('The source plan contains non-blocking warnings. Review the complete draft before saving.'));
});
