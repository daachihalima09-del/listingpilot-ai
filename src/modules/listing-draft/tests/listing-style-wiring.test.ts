import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGenerationInstructions } from '../../generation-instructions/index.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { generationInput } from '../../listing-generation/tests/fixtures.ts';
import { buildGenerationProviderInstructions, canonicalizeProviderOutput } from '../adapter/openai-generation-provider.ts';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import { ListingDraftError } from '../domain/errors.ts';
import { prepareListingDraftForSave } from '../persistence/draft-persistence.ts';
import { evaluateListingStyleCompliance, validateListingDraftOutput } from '../validation/draft-validator.ts';
import { validProviderOutput } from './fixtures.ts';

function customInput() {
  return generationInput({ listingStandard: 'MINIMAL', mutate(input) {
    const listing = input.merchantPreferences.listing as unknown as {
      standardId: string;
      rules: NonNullable<typeof input.merchantPreferences.listing.rules>;
      fingerprint: string;
    };
    listing.standardId = 'CUSTOM';
    listing.fingerprint = 'custom-listing-style-fingerprint';
    listing.rules = {
      ...listing.rules,
      title: { ...listing.rules.title, fieldOrder: ['MODEL', 'BRAND', 'PRODUCT_TYPE'], characterLimit: 95, separator: 'DASH' },
      description: { ...listing.rules.description, structure: 'BALANCED', paragraphCount: 3, tone: 'CONVERSATIONAL', technicalLevel: 'BALANCED' },
      features: { ...listing.rules.features, count: 5, maximumLength: 80, displayOrder: 'BENEFITS_FIRST', technicalFirst: false },
      requiredInformation: ['Brand', 'Model Number'],
      prohibitedContent: ['Unbeatable'],
    };
    (input.profileVersions.listing as { fingerprint: string; version: number }).fingerprint = listing.fingerprint;
    (input.profileVersions.listing as { fingerprint: string; version: number }).version = 2;
  } });
}

function compliantOutput(instructions: ReturnType<typeof createGenerationInstructions>) {
  const output = validProviderOutput(instructions);
  const aliases: Record<string, string[]> = {
    BRAND: ['brand'], PRODUCT_TYPE: ['product_type'], MODEL: ['model'],
    SIZE_OR_CAPACITY: ['screen_size', 'size', 'capacity'],
    TECHNOLOGY: ['display_technology', 'technology', 'resolution'],
  };
  const order = instructions.groups.TITLE.instructions.componentOrder as string[];
  const titleFacts = order.flatMap((component) => {
    const fact = instructions.allowedFacts.find(({ fieldId, allowedUses }) => aliases[component]?.includes(fieldId) && allowedUses.includes('TITLE'));
    return fact ? [fact] : [];
  });
  const separator = { SPACE: ' ', DASH: ' - ', PIPE: ' | ', COLON: ': ' }[String(instructions.groups.TITLE.instructions.separator)] ?? ' ';
  output.title = { value: titleFacts.map(({ value }) => value).join(separator), factIds: titleFacts.map(({ factId }) => factId) };
  const paragraphTarget = Number(instructions.groups.DESCRIPTION.instructions.overviewParagraphCount);
  const identityFacts = instructions.allowedFacts.filter(({ fieldId }) => ['brand', 'product_type'].includes(fieldId));
  const paragraph = identityFacts.map(({ value }) => value).join(' ');
  output.overview = { value: Array.from({ length: paragraphTarget }, () => paragraph).join('\n\n'), factIds: identityFacts.map(({ factId }) => factId) };
  return output;
}

test('Listing Standard and custom style changes alter plan and instruction fingerprints', () => {
  const neovixPlan = createListingGenerationPlan(generationInput({ listingStandard: 'NEOVIX' }));
  const minimalPlan = createListingGenerationPlan(generationInput({ listingStandard: 'MINIMAL' }));
  const customPlan = createListingGenerationPlan(customInput());
  assert.notEqual(neovixPlan.planFingerprint, minimalPlan.planFingerprint);
  assert.notEqual(minimalPlan.planFingerprint, customPlan.planFingerprint);
  assert.notEqual(createGenerationInstructions(neovixPlan).instructionFingerprint, createGenerationInstructions(minimalPlan).instructionFingerprint);
  assert.notEqual(createGenerationInstructions(minimalPlan).instructionFingerprint, createGenerationInstructions(customPlan).instructionFingerprint);
});

test('NEOVIX, Minimal, and Custom create visibly different structural contracts', () => {
  const plans = {
    NEOVIX: createListingGenerationPlan(generationInput({ listingStandard: 'NEOVIX' })),
    MINIMAL: createListingGenerationPlan(generationInput({ listingStandard: 'MINIMAL' })),
    CUSTOM: createListingGenerationPlan(customInput()),
  };
  assert.deepEqual([plans.NEOVIX.featurePlan.targetCount, plans.MINIMAL.featurePlan.targetCount, plans.CUSTOM.featurePlan.targetCount], [10, 4, 5]);
  assert.deepEqual([plans.NEOVIX.descriptionPlan.structure, plans.MINIMAL.descriptionPlan.structure, plans.CUSTOM.descriptionPlan.structure], ['SPECIFICATIONS_FIRST', 'OVERVIEW_FIRST', 'BALANCED']);
  assert.ok(plans.NEOVIX.descriptionPlan.overviewParagraphCount > plans.MINIMAL.descriptionPlan.overviewParagraphCount);
  assert.deepEqual(plans.CUSTOM.titlePlan.componentOrder, ['MODEL', 'BRAND', 'PRODUCT_TYPE']);
  for (const plan of Object.values(plans)) {
    const instructions = createGenerationInstructions(plan);
    const output = compliantOutput(instructions);
    assert.notEqual(evaluateListingStyleCompliance(output, instructions).status, 'REJECTED');
    assert.doesNotThrow(() => validateListingDraftOutput(output, instructions));
  }
});

test('NEOVIX and Minimal provider instructions differ materially beyond labels', () => {
  const neovix = createGenerationInstructions(createListingGenerationPlan(generationInput({ listingStandard: 'NEOVIX' })));
  const minimal = createGenerationInstructions(createListingGenerationPlan(generationInput({ listingStandard: 'MINIMAL' })));
  assert.notDeepEqual(neovix.groups.DESCRIPTION.instructions, minimal.groups.DESCRIPTION.instructions);
  assert.notDeepEqual(neovix.groups.FEATURES.instructions, minimal.groups.FEATURES.instructions);
  assert.notEqual(buildGenerationProviderInstructions(neovix), buildGenerationProviderInstructions(minimal));
  assert.equal(neovix.groups.DESCRIPTION.instructions.structure, 'SPECIFICATIONS_FIRST');
  assert.equal(minimal.groups.DESCRIPTION.instructions.structure, 'OVERVIEW_FIRST');
  assert.equal(neovix.groups.FEATURES.instructions.targetCount, 10);
  assert.equal(minimal.groups.FEATURES.instructions.targetCount, 4);
});

test('generated listing editor keeps NEOVIX merchant content in the required order', async () => {
  const source = await readFile(new URL('../review/ListingDraftReview.tsx', import.meta.url), 'utf8');
  const sections = ['title="Product Title"', "'Product Information'", 'title="Description"', 'title="Key Features"', 'title="SEO Summary"'];
  const positions = sections.map((section) => source.indexOf(section));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(source, /Evidence and quality details remain available under Review and Advanced/);
});

test('NEOVIX provider output has one Product Information row per label and marked features', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const output = validProviderOutput(instructions);
  output.specifications.push({ ...output.specifications.at(-1)!, value: output.specifications.at(-1)!.value });
  output.features[0]!.value = output.features[0]!.value.replace(/^\u2714\s/u, '');
  const canonical = canonicalizeProviderOutput(output, instructions);
  const labels = canonical.specifications.map(({ label }) => label.toLocaleLowerCase('en-US'));
  assert.equal(new Set(labels).size, labels.length);
  assert.equal(canonical.features.every(({ value }) => /^\u2714\s/u.test(value)), true);
  assert.equal(canonical.title.value.startsWith('Acme X1000 '), true);
  assert.equal(canonical.title.value.match(/\bX1000\b/gu)?.length, 1);
});

test('provider canonicalization removes optional citations not materially represented by a field', () => {
  const instructions = structuredClone(createGenerationInstructions(createListingGenerationPlan(generationInput())));
  const template = instructions.allowedFacts[0]!;
  const controls = { ...template, factId: 'controls-detail', fieldId: 'controls', value: 'LCD display, remote control and MyDyson app', allowedUses: ['SEO'] as const, visibilityRole: 'AVAILABLE_VERIFIED' as const, requiredPlacements: [] };
  (instructions.allowedFacts as unknown as Array<typeof controls>).push(controls);
  const output = validProviderOutput(instructions);
  output.seo.description = { value: `${output.title.value} uses smart controls.`, factIds: [...output.seo.description.factIds, controls.factId] };
  const canonical = canonicalizeProviderOutput(output, instructions);
  assert.equal(canonical.seo.description.factIds.includes(controls.factId), false);
});

test('citation pruning applies to Minimal Standard as well as NEOVIX', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput({ listingStandard: 'MINIMAL' })));
  const output = validProviderOutput(instructions);
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  output.seo.title = { value: 'Acme Cordless Vacuum', factIds: [model.factId] };
  assert.equal(canonicalizeProviderOutput(output, instructions).seo.title.factIds.includes(model.factId), false);
});

test('NEOVIX title normalization retains a concise model, capacity and useful technology without a long alias', () => {
  const instructions = structuredClone(createGenerationInstructions(createListingGenerationPlan(generationInput())));
  const brand = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  (brand as { value: string }).value = 'Dyson';
  (model as { value: string }).value = 'PH05 (Purifier Humidify+Cool PH2 De-NOx)';
  const output = validProviderOutput(instructions);
  output.title = {
    value: 'Dyson Air Purifier Humidifier and Cooling Fan 5 L HEPA H13 Wi-Fi Control PH05 (Purifier Humidify+Cool PH2 De-NOx)',
    factIds: [brand.factId, model.factId],
  };
  const canonical = canonicalizeProviderOutput(output, instructions);
  assert.equal(canonical.title.value, 'Dyson PH05 Air Purifier Humidifier and Cooling Fan 5L HEPA H13 Wi-Fi Control');
  assert.equal(canonical.title.value.includes('Purifier Humidify+Cool PH2 De-NOx'), false);
  assert.equal(canonical.title.value.match(/\bPH05\b/gu)?.length, 1);
});

test('title canonicalization does not override a merchant-selected legacy component order', () => {
  const instructions = structuredClone(createGenerationInstructions(createListingGenerationPlan(generationInput())));
  (instructions.groups.TITLE.instructions as { componentOrder: string[] }).componentOrder = ['BRAND', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY', 'MODEL'];
  const output = validProviderOutput(instructions);
  const brand = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'brand')!;
  const model = instructions.allowedFacts.find(({ fieldId }) => fieldId === 'model')!;
  output.title = { value: `${brand.value} Television 55 4K UHD ${model.value}`, factIds: [brand.factId, model.factId] };
  assert.equal(canonicalizeProviderOutput(output, instructions).title.value, output.title.value);
});

test('provider instructions explicitly bind every visible merchant style rule', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(customInput()));
  const provider = buildGenerationProviderInstructions(instructions);
  for (const rule of ['TITLE.componentOrder', 'DESCRIPTION.structure', 'overviewParagraphCount', 'FEATURES.targetCount', 'maximumFeatureLength', 'Merchant TITLE, DESCRIPTION, and FEATURES rules take precedence']) {
    assert.match(provider, new RegExp(rule.replaceAll('.', '\\.')));
  }
  assert.equal((instructions.groups.TITLE.instructions.componentOrder as string[]).join(','), 'MODEL,BRAND,PRODUCT_TYPE');
  assert.equal(instructions.groups.DESCRIPTION.instructions.structure, 'BALANCED');
  assert.equal(instructions.groups.FEATURES.instructions.targetCount, 5);
});

test('NEOVIX instructions prioritize strong verified evidence without weakening factual boundaries', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(generationInput()));
  const provider = buildGenerationProviderInstructions(instructions);
  for (const phrase of [
    'Brand → primary Model → clear Product Type',
    'one to three strongest searchable verified differentiators',
    'strongest commercially relevant verified facts',
    'important verified measurable claim',
    'A verified numeric performance claim may be used only when its exact number and unit are cited',
    'Never use or infer facts that are absent',
    'factIds are a minimal evidence ledger, not a bucket of related Product Truth',
    'AVAILABLE_VERIFIED facts are optional: omit both the fact and its factId when the field does not use it',
  ]) assert.match(provider, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  assert.doesNotMatch(provider, /television-specific requirements into non-TV/iu);
});

test('mandatory feature count, title order, and prohibited wording are rejected', () => {
  const instructions = createGenerationInstructions(createListingGenerationPlan(customInput()));
  const wrongCount = compliantOutput(instructions);
  wrongCount.features = wrongCount.features.slice(0, 4);
  assert.throws(() => validateListingDraftOutput(wrongCount, instructions), ListingDraftError);
  const wrongOrder = compliantOutput(instructions);
  wrongOrder.title = { ...wrongOrder.title, value: [...wrongOrder.title.value.split(' ')].reverse().join(' ') };
  assert.throws(() => validateListingDraftOutput(wrongOrder, instructions), ListingDraftError);
  const prohibited = compliantOutput(instructions);
  prohibited.overview = { ...prohibited.overview, value: `${prohibited.overview.value} Unbeatable` };
  assert.throws(() => validateListingDraftOutput(prohibited, instructions), ListingDraftError);
});

test('new drafts store Listing Style provenance while an existing draft remains unchanged', async () => {
  const oldInstructions = createGenerationInstructions(createListingGenerationPlan(generationInput({ listingStandard: 'NEOVIX' })));
  const oldDraft = await new ListingDraftEngine({ provider: { generate: async () => ({ output: compliantOutput(oldInstructions), requestId: null }) } }).generate(oldInstructions);
  const oldCopy = structuredClone(oldDraft);
  const latestInstructions = createGenerationInstructions(createListingGenerationPlan(customInput()));
  const latestDraft = await new ListingDraftEngine({ provider: { generate: async () => ({ output: compliantOutput(latestInstructions), requestId: null }) } }).generate(latestInstructions);
  assert.deepEqual(oldDraft, oldCopy);
  assert.equal(oldDraft.metadata.listingStandardId, 'NEOVIX');
  assert.equal(latestDraft.metadata.listingStandardId, 'CUSTOM');
  assert.equal(latestDraft.metadata.listingProfileVersion, 2);
  assert.equal(latestDraft.metadata.listingProfileFingerprint, 'custom-listing-style-fingerprint');
  assert.notEqual(oldDraft.sourceInstructionFingerprint, latestDraft.sourceInstructionFingerprint);

  const savedOldDraft = prepareListingDraftForSave(
    oldDraft,
    latestInstructions,
    '2026-08-09T12:00:00.000Z',
  );
  assert.equal(savedOldDraft.sourceInstructionFingerprint, oldDraft.sourceInstructionFingerprint);
  assert.equal(savedOldDraft.metadata.listingProfileFingerprint, oldDraft.metadata.listingProfileFingerprint);
  assert.equal(savedOldDraft.metadata.styleComplianceStatus, oldDraft.metadata.styleComplianceStatus);
});

test('workspace warns about a changed profile and links to Listing Style settings', async () => {
  const source = await readFile(new URL('../../../components/workspace/ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /Your Listing Style changed after this draft was generated/);
  assert.match(source, /Generate New Draft/);
  assert.match(source, /\/settings\/business-profile\/listing/);
  assert.match(source, /listingProfileFingerprint/);
});
