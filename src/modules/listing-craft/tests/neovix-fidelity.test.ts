import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createGenerationInstructions } from '../../generation-instructions/index.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { generationInput } from '../../listing-generation/tests/fixtures.ts';
import { buildGenerationProviderInstructions } from '../../listing-draft/adapter/openai-generation-provider.ts';
import { neovixCraftRulePack, projectCraftPack, validateDraftCraftCompliance } from '../index.ts';
import { neovixCategoryFixtures } from './fixtures/neovix-category-fixtures.ts';

const facts = [
  { factId: 'brand', fieldId: 'brand', value: 'Dyson', truthStatus: 'VERIFIED' },
  { factId: 'model', fieldId: 'model', value: 'TP10', truthStatus: 'VERIFIED' },
  { factId: 'type', fieldId: 'product_type', value: 'Air Purifier', truthStatus: 'VERIFIED' },
  { factId: 'filter', fieldId: 'filtration', value: 'HEPA H13', truthStatus: 'VERIFIED' },
  { factId: 'mode', fieldId: 'modes', value: 'Night Mode', truthStatus: 'VERIFIED' },
  { factId: 'control', fieldId: 'app_control', value: 'App Control', truthStatus: 'VERIFIED' },
] as const;
const field = (value: string, factIds: readonly string[]) => ({ value, factIds });
const draft = {
  title: field('Dyson TP10 Air Purifier HEPA H13', ['brand', 'type', 'filter', 'model']),
  specifications: [
    { label: 'Model', ...field('TP10', ['model']) },
    { label: 'Brand', ...field('Dyson', ['brand']) },
    { label: 'Type', ...field('Air Purifier', ['type']) },
    { label: 'Key Technologies', ...field('HEPA H13', ['filter']) },
    { label: 'Programs / Functions', ...field('Night Mode', ['mode']) },
    { label: 'Control', ...field('App Control', ['control']) },
  ],
  overview: field('The Dyson TP10 is an Air Purifier with HEPA H13 filtration.\n\nNight Mode and App Control support flexible everyday operation.', facts.map(({ factId }) => factId)),
  features: [field('HEPA H13 filtration', ['filter']), field('Night Mode operation', ['mode']), field('App Control access', ['control'])],
};

test('NEOVIX plan and instructions carry an ordered first-class fact block', () => {
  const plan = createListingGenerationPlan(generationInput());
  const instructions = createGenerationInstructions(plan);
  const block = instructions.groups.DESCRIPTION.instructions.structuredFactBlock as { required: boolean; sectionPosition: number; labelOrder: string[]; fields: { label: string; factIds: string[] }[] };
  assert.equal(plan.craftPlan?.packId, 'neovix');
  assert.equal(block.required, true);
  assert.equal(block.sectionPosition, 0);
  assert.deepEqual(block.labelOrder.slice(0, 4), ['Model', 'Brand', 'Type', 'Capacity']);
  assert.equal(block.fields.some(({ label }) => label === 'Finish'), false);
  assert.equal(block.fields.find(({ label }) => label === 'Model')?.factIds.length, 1);
});

test('category fixtures map television, purifier, vacuum, beauty and generic facts into one recognizable grammar', () => {
  const groups = neovixCraftRulePack.specificationRules.fieldGroups;
  for (const fixture of neovixCategoryFixtures) {
    const labels = groups
      .filter(({ fieldIds }) => fixture.fieldIds.some((fieldId) => fieldIds.includes(fieldId)))
      .map(({ label }) => label);
    assert.deepEqual(labels, fixture.expectedLabels, fixture.category);
    assert.equal(new Set(fixture.featurePriority).size, fixture.featurePriority.length, fixture.category);
    assert.equal(fixture.featurePriority.every((fieldId) => fixture.fieldIds.includes(fieldId)), true, fixture.category);
  }
});

test('ordered verified facts pass while unavailable optional rows are omitted', () => {
  const result = validateDraftCraftCompliance({
    draft, facts, craft: projectCraftPack(neovixCraftRulePack),
    structuredFactBlock: { required: true, fields: [
      { label: 'Model', factIds: ['model'], required: true },
      { label: 'Brand', factIds: ['brand'], required: true },
      { label: 'Type', factIds: ['type'], required: true },
      { label: 'Capacity', factIds: [], required: false },
      { label: 'Key Technologies', factIds: ['filter'], required: false },
      { label: 'Programs / Functions', factIds: ['mode'], required: false },
      { label: 'Control', factIds: ['control'], required: false },
    ] },
    productIntelligencePriorityFieldIds: ['filtration', 'modes', 'app_control'],
  });
  for (const code of ['NEOVIX_FACT_BLOCK_MISSING', 'NEOVIX_FACT_LABEL_ORDER', 'NEOVIX_UNSUPPORTED_CLAIM']) assert.equal(result.findings.some((finding) => finding.code === code), false);
});

test('missing required facts create review without inventing optional values', () => {
  const result = validateDraftCraftCompliance({
    draft: { ...draft, specifications: draft.specifications.filter(({ label }) => label !== 'Type') },
    facts: facts.filter(({ fieldId }) => fieldId !== 'product_type'),
    craft: projectCraftPack(neovixCraftRulePack),
    structuredFactBlock: { required: true, fields: [
      { label: 'Model', factIds: ['model'], required: true },
      { label: 'Brand', factIds: ['brand'], required: true },
      { label: 'Type', factIds: [], required: true },
      { label: 'Finish', factIds: [], required: false },
    ] },
  });
  assert.equal(result.findings.some(({ code }) => code === 'NEOVIX_REQUIRED_FACT_REVIEW'), true);
  assert.equal(result.findings.some(({ message }) => message.includes('Finish')), false);
});

test('unsupported rows, label order, generic openings, stuffing, feature count, duplicates and priority are detected', () => {
  const result = validateDraftCraftCompliance({
    draft: {
      ...draft,
      title: field('Dyson Air Purifier HEPA H13 TP10 '.repeat(6), ['brand', 'type', 'filter', 'model']),
      specifications: [draft.specifications[1]!, draft.specifications[0]!, { label: 'Capacity', ...field('Large Room', []) }],
      overview: field(`Experience ${'Dyson TP10 Air Purifier HEPA H13 '.repeat(30)}`, ['brand', 'model', 'type', 'filter']),
      features: [field('App Control access', ['control']), field('HEPA H13 filtration', ['filter']), field('HEPA H13 filtration', ['filter'])],
    },
    facts, craft: projectCraftPack(neovixCraftRulePack),
    productIntelligencePriorityFieldIds: ['filtration', 'modes', 'app_control'], featureTargetCount: 10,
  });
  const codes = new Set(result.findings.map(({ code }) => code));
  for (const code of ['NEOVIX_UNSUPPORTED_CLAIM', 'NEOVIX_FACT_LABEL_ORDER', 'NEOVIX_TITLE_STUFFING', 'NEOVIX_OVERVIEW_TOO_LONG', 'NEOVIX_GENERIC_AI_OPENING', 'NEOVIX_FEATURE_COUNT', 'NEOVIX_FEATURE_PRIORITY', 'NEOVIX_FEATURE_DUPLICATE']) assert.equal(codes.has(code), true);
});

test('merchant customization wins where compatible while factual safety remains mandatory', () => {
  const plan = createListingGenerationPlan(generationInput({ mutate(input) {
    const rules = input.merchantPreferences.listing.rules!;
    rules.title.fieldOrder = ['MODEL', 'BRAND', 'PRODUCT_TYPE'];
    rules.features.count = 6;
    rules.description.paragraphCount = 1;
    rules.prohibitedContent.push('Revolutionary');
  } }));
  const instructions = createGenerationInstructions(plan);
  assert.deepEqual(instructions.groups.TITLE.instructions.componentOrder, ['MODEL', 'BRAND', 'PRODUCT_TYPE']);
  assert.equal(instructions.groups.FEATURES.instructions.targetCount, 6);
  assert.equal(instructions.groups.DESCRIPTION.instructions.overviewParagraphCount, 1);
  assert.equal((instructions.groups.DESCRIPTION.instructions.prohibitedTerms as string[]).includes('Revolutionary'), true);
  assert.equal(instructions.groups.SAFETY.prohibitedOutputs.includes('AI:INVENT_FACTS'), true);
});

test('blind structural comparison distinguishes NEOVIX, Minimal, Marketplace, Luxury and Custom', () => {
  const custom = generationInput({ listingStandard: 'MINIMAL', mutate(input) {
    const listing = input.merchantPreferences.listing as unknown as { standardId: string; rules: NonNullable<typeof input.merchantPreferences.listing.rules> };
    listing.standardId = 'CUSTOM';
    listing.rules.description.structure = 'BALANCED'; listing.rules.description.paragraphCount = 3;
    listing.rules.features.count = 5; listing.rules.title.fieldOrder = ['MODEL', 'BRAND'];
  } });
  const inputs = [
    generationInput({ listingStandard: 'NEOVIX' }), generationInput({ listingStandard: 'MINIMAL' }),
    generationInput({ listingStandard: 'MARKETPLACE' }), generationInput({ listingStandard: 'LUXURY_RETAIL' as 'NEOVIX' }), custom,
  ];
  const signatures = inputs.map((input) => { const plan = createListingGenerationPlan(input); return JSON.stringify({ craft: plan.craftPlan?.packId ?? null, title: plan.titlePlan.componentOrder, structure: plan.descriptionPlan.sectionOrder, paragraphs: plan.descriptionPlan.overviewParagraphCount, features: plan.featurePlan.targetCount, featureOrder: plan.featurePlan.featureOrder, tone: plan.descriptionPlan.tone }); });
  assert.equal(new Set(signatures).size, 5);
});

test('provider and review expose NEOVIX structure without static product content', async () => {
  const provider = buildGenerationProviderInstructions(createGenerationInstructions(createListingGenerationPlan(generationInput())));
  const review = await readFile(new URL('../../listing-draft/review/ListingDraftReview.tsx', import.meta.url), 'utf8');
  assert.match(provider, /DESCRIPTION\.structuredFactBlock/);
  assert.match(provider, /FEATURES\.priorityGroups/);
  for (const label of ['Product Information', 'Description', 'Structure', 'Facts', 'Features', 'Duplication', 'Tone']) assert.match(review, new RegExp(label));
  assert.doesNotMatch(`${provider}\n${review}`, /Samsung|Q80D|Amazon Product|Refresh Rate: 120/i);
});
