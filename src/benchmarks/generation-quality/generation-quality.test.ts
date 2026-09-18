import assert from 'node:assert/strict';
import test from 'node:test';
import { createGenerationInstructions } from '../../modules/generation-instructions/index.ts';
import { unsupportedFactualTokens } from '../../modules/generation-instructions/domain/fact-fidelity.ts';
import { createListingGenerationPlan } from '../../modules/listing-generation/index.ts';
import { finding, generationInput } from '../../modules/listing-generation/tests/fixtures.ts';
import { ListingDraftError } from '../../modules/listing-draft/domain/errors.ts';
import { validateListingDraftOutput } from '../../modules/listing-draft/validation/draft-validator.ts';
import { defaultProductIntelligenceRegistry, detectProductCategory } from '../../modules/product-intelligence/index.ts';
import { benchmarkInstructions, benchmarkProviderOutput, generationBenchmarkFixtures } from './fixtures.ts';
import { scoreGenerationCandidate } from './rubric.ts';

test('six synthetic categories produce merchant-ready deterministic candidates without provider calls', () => {
  for (const fixture of generationBenchmarkFixtures) {
    for (const standard of ['NEOVIX', 'MINIMAL'] as const) {
      const instructions = benchmarkInstructions(fixture);
      const output = benchmarkProviderOutput(fixture, standard);
      assert.doesNotThrow(() => validateListingDraftOutput(output, instructions, { enforceListingStyle: false }), `${fixture.category}/${standard}`);
      const score = scoreGenerationCandidate(fixture, output, standard);
      assert.equal(score.criticalFailures.length, 0, fixture.category);
      assert.ok(score.total >= 90, `${fixture.category}/${standard}: ${score.total}`);
    }
  }
});

test('source fixtures retain provenance, noisy supplier language and non-assumed equivalence challenges outside Product Truth', () => {
  for (const fixture of generationBenchmarkFixtures) {
    assert.equal(fixture.sourceFragments.some(({ authority }) => authority === 'MANUFACTURER'), true);
    assert.equal(fixture.sourceFragments.some(({ authority, text }) => authority === 'SUPPLIER' && /revolutionary|unmatched/iu.test(text)), true);
    assert.equal(fixture.facts.some(({ value }) => /revolutionary|unmatched/iu.test(value)), false);
    assert.equal(fixture.equivalenceChallenges.every(({ automaticallyEquivalent }) => automaticallyEquivalent === false), true);
  }
});

test('dedicated television detection remains deterministic while unsupported categories use conservative generic intelligence', () => {
  const television = detectProductCategory({ productType: 'QLED Smart TV', title: 'Aurum VX65 QLED Smart TV' }, defaultProductIntelligenceRegistry);
  assert.equal(television.status, 'MATCHED');
  assert.equal(television.category, 'TELEVISION');
  for (const productType of ['Cordless Wet And Dry Vacuum', 'Air Purifier', 'Hair Dryer', 'Game Console', 'Adjustable Desk Lamp']) {
    const result = detectProductCategory({ productType, title: `Synthetic ${productType}` }, defaultProductIntelligenceRegistry);
    assert.equal(result.status, 'UNKNOWN', productType);
    assert.equal(result.matchedPackId, null, productType);
  }
});

test('conflicts and missing optional facts stay out of the generation instruction package', () => {
  const plan = createListingGenerationPlan(generationInput({ findings: [
    finding('brand', 'Aurum'), finding('model', 'VX65'), finding('product_type', 'Television'),
    finding('screen_size', '65 inch'), finding('resolution', '4K UHD'),
    finding('refresh_rate', '120 Hz', 'CONFLICTED', { candidateValues: ['120 Hz', '144 Hz'] }),
    finding('warranty', '', 'UNRESOLVED'),
  ] }));
  const instructions = createGenerationInstructions(plan);
  assert.equal(instructions.allowedFacts.some(({ fieldId }) => fieldId === 'refresh_rate'), false);
  assert.equal(instructions.allowedFacts.some(({ fieldId }) => fieldId === 'warranty'), false);
  assert.equal(plan.conflictedFacts.some(({ fieldId }) => fieldId === 'refresh_rate'), true);
});

test('optional omitted facts never appear in the evidence ledger', () => {
  const fixture = generationBenchmarkFixtures.find(({ category }) => category === 'VACUUM')!;
  const output = benchmarkProviderOutput(fixture, 'MINIMAL');
  const optional = fixture.facts.find(({ optional }) => optional)!;
  assert.equal([output.title, output.overview, ...output.features, output.seo.title, output.seo.description].some(({ factIds }) => factIds.includes(optional.id)), false);
});

test('adversarial numeric, acronym, warranty, citation and sibling-variant claims fail closed', () => {
  const cases = [
    { generated: '70 minutes runtime', evidence: ['60 minutes runtime'] },
    { generated: '75-inch OLED display', evidence: ['65 inch LED display'] },
    { generated: '2-year warranty', evidence: ['Aurum VX65'] },
    { generated: '2 TB SSD', evidence: ['1 TB SSD'] },
    { generated: '1800W motor', evidence: ['1600 W motor'] },
  ];
  for (const item of cases) assert.notDeepEqual(unsupportedFactualTokens(item.generated, item.evidence), [], item.generated);

  const fixture = generationBenchmarkFixtures[0]!;
  const instructions = benchmarkInstructions(fixture);
  const overCited = benchmarkProviderOutput(fixture, 'MINIMAL');
  const optional = fixture.facts.find(({ optional }) => optional)!;
  overCited.features[0]!.factIds.push(optional.id);
  assert.throws(() => validateListingDraftOutput(overCited, instructions, { enforceListingStyle: false }), (error: unknown) => error instanceof ListingDraftError && error.metadata.reason === 'CITATION_NOT_REPRESENTED');

  const duplicated = benchmarkProviderOutput(fixture, 'NEOVIX');
  duplicated.features[1] = { ...duplicated.features[0]!, value: duplicated.features[0]!.value.replace('screen', 'display') };
  assert.ok(scoreGenerationCandidate(fixture, duplicated, 'NEOVIX').dimensions.featureQuality < 15);
});

test('multi-variant facts are excluded unless the Product has exactly the matching variant', () => {
  const multi = createListingGenerationPlan(generationInput({
    findings: [
      finding('brand', 'Aurum'), finding('model', 'VX'), finding('product_type', 'Television'),
      finding('screen_size', '55 inch', 'VERIFIED', { variantId: 'variant-55' }),
      finding('screen_size', '65 inch', 'VERIFIED', { variantId: 'variant-65' }),
    ],
    mutate(input) {
      (input.product.variants as Array<typeof input.product.variants[number]>).push({
        ...structuredClone(input.product.variants[0]!), id: 'variant-65', title: '65 inch', options: { Size: '65' },
      });
    },
  }));
  assert.equal(multi.selectedFacts.some(({ variantId }) => variantId !== null), false);
  assert.equal(multi.excludedFacts.filter(({ fieldId }) => fieldId === 'screen_size').length, 2);
  assert.equal(multi.reviewRequirements.some(({ metadata }) => metadata.variantScopeSafe === false), true);

  const single = createListingGenerationPlan(generationInput({ findings: [
    finding('brand', 'Aurum'), finding('model', 'VX55'), finding('product_type', 'Television'),
    finding('screen_size', '55 inch', 'VERIFIED', { variantId: 'variant-55' }),
  ] }));
  assert.equal(single.selectedFacts.some(({ fieldId, variantId }) => fieldId === 'screen_size' && variantId === 'variant-55'), true);
});

test('NEOVIX and Minimal change presentation without changing Product Truth', () => {
  const fixture = generationBenchmarkFixtures.find(({ category }) => category === 'AIR_PURIFIER')!;
  const neovix = benchmarkProviderOutput(fixture, 'NEOVIX');
  const minimal = benchmarkProviderOutput(fixture, 'MINIMAL');
  assert.equal(neovix.features.every(({ value }) => value.startsWith('✔ ')), true);
  assert.equal(minimal.features.every(({ value }) => !value.startsWith('✔ ')), true);
  assert.notEqual(neovix.features.length, minimal.features.length);
  assert.deepEqual(new Set(neovix.title.factIds), new Set(minimal.title.factIds));
  assert.equal(fixture.facts.every((fact) => benchmarkInstructions(fixture).allowedFacts.some(({ factId }) => factId === fact.id)), true);
});
