import type { GenerationInstructions } from '../../modules/generation-instructions/domain/contracts.ts';
import type { ListingDraftProviderOutputInput } from '../../modules/listing-draft/validation/draft-schema.ts';
import { draftInstructions } from '../../modules/listing-draft/tests/fixtures.ts';

export type BenchmarkCategory = 'TELEVISION' | 'VACUUM' | 'AIR_PURIFIER' | 'BEAUTY' | 'GAMING' | 'GENERIC';
export type BenchmarkStandard = 'NEOVIX' | 'MINIMAL';

export interface BenchmarkFact {
  readonly id: string;
  readonly fieldId: string;
  readonly value: string;
  readonly identity?: boolean;
  readonly optional?: boolean;
}

export interface GenerationBenchmarkFixture {
  readonly id: string;
  readonly category: BenchmarkCategory;
  readonly productType: string;
  readonly facts: readonly BenchmarkFact[];
  readonly missingFacts: readonly string[];
  readonly conflictingFacts: readonly { readonly fieldId: string; readonly values: readonly string[] }[];
  readonly forbiddenClaims: readonly string[];
  readonly sourceFragments: readonly { readonly authority: 'MANUFACTURER' | 'SUPPLIER'; readonly text: string }[];
  readonly equivalenceChallenges: readonly { readonly left: string; readonly right: string; readonly automaticallyEquivalent: boolean }[];
}

const fixture = (
  id: string,
  category: BenchmarkCategory,
  productType: string,
  values: readonly Omit<BenchmarkFact, 'id'>[],
  options: Pick<GenerationBenchmarkFixture, 'missingFacts' | 'conflictingFacts' | 'forbiddenClaims'>,
): GenerationBenchmarkFixture => ({
  id,
  category,
  productType,
  facts: values.map((fact, index) => ({ id: `${id}-fact-${index + 1}`, ...fact })),
  sourceFragments: [
    { authority: 'MANUFACTURER', text: values.map(({ value }) => value).join(' | ') },
    { authority: 'SUPPLIER', text: `Revolutionary ${productType} with unmatched performance for everyone.` },
  ],
  equivalenceChallenges: values.some(({ value }) => value === '60 minutes')
    ? [{ left: '60 minutes', right: 'up to 60 min', automaticallyEquivalent: false }]
    : values.some(({ value }) => value === '4K UHD')
      ? [{ left: '4K UHD', right: '3840 × 2160', automaticallyEquivalent: false }]
      : values.some(({ value }) => value === 'HEPA H13 filtration')
        ? [{ left: 'HEPA H13', right: 'H13-grade HEPA', automaticallyEquivalent: false }]
        : [],
  ...options,
});

export const generationBenchmarkFixtures: readonly GenerationBenchmarkFixture[] = Object.freeze([
  fixture('television', 'TELEVISION', 'QLED Smart Television', [
    { fieldId: 'brand', value: 'Aurum', identity: true }, { fieldId: 'model', value: 'VX65', identity: true },
    { fieldId: 'product_type', value: 'QLED Smart Television', identity: true }, { fieldId: 'screen_size', value: '65 inch screen' },
    { fieldId: 'resolution', value: '4K UHD resolution' }, { fieldId: 'hdr', value: 'HDR10 support' }, { fieldId: 'refresh_rate', value: '120 Hz native refresh rate', optional: true },
  ], { missingFacts: ['warranty'], conflictingFacts: [{ fieldId: 'audio_output', values: ['20 W', '30 W'] }], forbiddenClaims: ['8K', '144 Hz', '75 inch'] }),
  fixture('vacuum', 'VACUUM', 'Cordless Wet And Dry Vacuum', [
    { fieldId: 'brand', value: 'Nimbus', identity: true }, { fieldId: 'model', value: 'V9', identity: true },
    { fieldId: 'product_type', value: 'Cordless Wet And Dry Vacuum', identity: true }, { fieldId: 'runtime', value: '60 minutes runtime' },
    { fieldId: 'bin_capacity', value: '0.8 L bin capacity' }, { fieldId: 'filtration', value: 'HEPA filtration' }, { fieldId: 'attachments', value: 'Crevice tool and floor head', optional: true },
  ], { missingFacts: ['suction_power'], conflictingFacts: [], forbiddenClaims: ['70 minutes', '2-year warranty', 'self-emptying'] }),
  fixture('air-purifier', 'AIR_PURIFIER', 'Air Purifier', [
    { fieldId: 'brand', value: 'AeroPure', identity: true }, { fieldId: 'model', value: 'AP400', identity: true },
    { fieldId: 'product_type', value: 'Air Purifier', identity: true }, { fieldId: 'filtration', value: 'HEPA H13 filtration' },
    { fieldId: 'room_coverage', value: '45 m² room coverage' }, { fieldId: 'sensors', value: 'PM2.5 sensor' }, { fieldId: 'operating_modes', value: 'Auto and Sleep modes', optional: true },
  ], { missingFacts: ['noise_level'], conflictingFacts: [], forbiddenClaims: ['removes all viruses', '60 m²', 'Wi-Fi'] }),
  fixture('beauty', 'BEAUTY', 'Hair Dryer', [
    { fieldId: 'brand', value: 'LumaAir', identity: true }, { fieldId: 'model', value: 'HD2', identity: true },
    { fieldId: 'product_type', value: 'Hair Dryer', identity: true }, { fieldId: 'power', value: '1600 W rated power' },
    { fieldId: 'heat_settings', value: '3 heat settings' }, { fieldId: 'speed_settings', value: '2 speed settings' }, { fieldId: 'attachments', value: 'Diffuser and concentrator', optional: true },
  ], { missingFacts: ['motor_speed'], conflictingFacts: [], forbiddenClaims: ['1800 W', 'prevents all heat damage', 'professional salon results'] }),
  fixture('gaming', 'GAMING', 'Game Console', [
    { fieldId: 'brand', value: 'Vertex', identity: true }, { fieldId: 'model', value: 'GX1', identity: true },
    { fieldId: 'product_type', value: 'Game Console', identity: true }, { fieldId: 'storage', value: '1 TB SSD storage' },
    { fieldId: 'video_output', value: '4K video output' }, { fieldId: 'connectivity', value: 'HDMI 2.1 connectivity' }, { fieldId: 'included_hardware', value: 'Wireless controller', optional: true },
  ], { missingFacts: ['frame_rate'], conflictingFacts: [], forbiddenClaims: ['8K gaming', '2 TB', 'VR headset included'] }),
  fixture('generic', 'GENERIC', 'Adjustable Desk Lamp', [
    { fieldId: 'brand', value: 'Cedar Arc', identity: true }, { fieldId: 'model', value: 'M1', identity: true },
    { fieldId: 'product_type', value: 'Adjustable Desk Lamp', identity: true }, { fieldId: 'power', value: '12 W rated power' },
    { fieldId: 'connectivity', value: 'USB-C power input' }, { fieldId: 'finish', value: 'Matte black', optional: true },
  ], { missingFacts: ['luminous_flux'], conflictingFacts: [], forbiddenClaims: ['wireless charging', 'smart home control', 'lifetime warranty'] }),
]);

export function benchmarkInstructions(fixtureValue: GenerationBenchmarkFixture): GenerationInstructions {
  const instructions = structuredClone(draftInstructions());
  const template = instructions.allowedFacts[0]!;
  (instructions as { allowedFacts: GenerationInstructions['allowedFacts'] }).allowedFacts = fixtureValue.facts.map((fact) => ({
    ...template,
    factId: fact.id,
    fieldId: fact.fieldId,
    value: fact.value,
    visibilityRole: fact.identity ? 'REQUIRED_VISIBLE' : 'AVAILABLE_VERIFIED',
    requiredPlacements: fact.identity ? ['TITLE'] : [],
  }));
  const handleRules = instructions.groups.SEO.instructions.handle;
  if (handleRules && typeof handleRules === 'object') {
    (handleRules as { lockedExistingHandle: string | null }).lockedExistingHandle = null;
  }
  return instructions;
}

export function benchmarkProviderOutput(
  fixtureValue: GenerationBenchmarkFixture,
  standard: BenchmarkStandard,
): ListingDraftProviderOutputInput {
  const byField = new Map(fixtureValue.facts.map((fact) => [fact.fieldId, fact]));
  const identity = ['brand', 'model', 'product_type'].map((fieldId) => byField.get(fieldId)!);
  const details = fixtureValue.facts.filter((fact) => !fact.identity);
  const titleFacts = [...identity, ...details.slice(0, 2)];
  const featureFacts = details.slice(0, standard === 'NEOVIX' ? 5 : 3);
  const marker = standard === 'NEOVIX' ? '✔ ' : '';
  const brand = byField.get('brand')!;
  const model = byField.get('model')!;
  const productType = byField.get('product_type')!;
  const overviewFacts = [brand, model, productType, ...details.slice(0, 2)];
  return {
    title: { value: titleFacts.map(({ value }) => value).join(' '), factIds: titleFacts.map(({ id }) => id) },
    overview: { value: `${brand.value} ${model.value} is a ${productType.value}.${standard === 'NEOVIX' ? '\n\n' : ' '}It has ${details.slice(0, 2).map(({ value }) => value).join(' and ')}.`, factIds: overviewFacts.map(({ id }) => id) },
    specifications: fixtureValue.facts.map((fact) => ({ label: fact.fieldId.replaceAll('_', ' '), value: fact.value, factIds: [fact.id] })),
    features: featureFacts.map((fact) => ({ value: `${marker}${fact.value}`, factIds: [fact.id] })),
    whatsIncluded: [],
    seo: {
      title: { value: [brand.value, model.value, productType.value, details[0]?.value].filter(Boolean).join(' '), factIds: [brand.id, model.id, productType.id, ...(details[0] ? [details[0].id] : [])] },
      description: { value: `${brand.value} ${model.value} ${productType.value} with ${details.slice(0, 2).map(({ value }) => value).join(' and ')}.`, factIds: overviewFacts.map(({ id }) => id) },
      handle: { value: `${brand.value}-${model.value}`.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, '-'), factIds: [brand.id, model.id] },
    },
    catalog: { tags: [], collections: [], productType: { value: '', factIds: [] }, vendor: { value: '', factIds: [] } },
    metafields: [], media: [], reviewNotes: ['Review the complete draft before publishing.'],
    confidence: { overall: 95, summary: 'All material claims use selected verified facts.', fieldNotes: [] },
  };
}
