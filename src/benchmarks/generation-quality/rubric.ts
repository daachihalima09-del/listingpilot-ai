import { factValueIsRepresented, unsupportedFactualTokens } from '../../modules/generation-instructions/domain/fact-fidelity.ts';
import type { ListingDraftProviderOutputInput } from '../../modules/listing-draft/validation/draft-schema.ts';
import type { BenchmarkStandard, GenerationBenchmarkFixture } from './fixtures.ts';

export interface BenchmarkScore {
  readonly total: number;
  readonly dimensions: Readonly<Record<'factualAccuracy' | 'productIdentity' | 'titleQuality' | 'descriptionQuality' | 'featureQuality' | 'seoQuality' | 'standardCompliance' | 'grammarNaturalness' | 'evidencePrecision', number>>;
  readonly criticalFailures: readonly string[];
}

const normalized = (value: string) => value.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/gu, ' ').trim();
const featureKey = (value: string) => normalized(value).replace(/\b(?:and|for|the|with)\b/gu, '').replace(/\b(filters?|filtered|filtering)\b/gu, 'filter').replace(/\b(?:display|screen)\b/gu, 'display').replace(/\s+/gu, ' ').trim();

export function scoreGenerationCandidate(
  fixture: GenerationBenchmarkFixture,
  output: ListingDraftProviderOutputInput,
  standard: BenchmarkStandard,
): BenchmarkScore {
  const facts = new Map(fixture.facts.map((fact) => [fact.id, fact]));
  const fields = [
    output.title, output.overview, ...output.features, output.seo.title, output.seo.description,
  ];
  const unsupported = fields.flatMap((field) => unsupportedFactualTokens(field.value, field.factIds.map((id) => facts.get(id)?.value ?? '')));
  const irrelevantCitations = fields.flatMap((field) => field.factIds.filter((id) => {
    const fact = facts.get(id);
    return !fact || !factValueIsRepresented(field.value, fact.value);
  }));
  const criticalFailures = [
    ...(unsupported.length ? [`Unsupported factual tokens: ${unsupported.join(', ')}`] : []),
    ...(fixture.forbiddenClaims.some((claim) => normalized(fields.map(({ value }) => value).join(' ')).includes(normalized(claim))) ? ['Forbidden or cross-variant claim present'] : []),
  ];
  const identityFacts = fixture.facts.filter(({ identity }) => identity);
  const identityVisible = identityFacts.every((fact) => factValueIsRepresented(output.title.value, fact.value));
  const titleTokens = normalized(output.title.value).split(' ').filter(Boolean);
  const duplicateTitleToken = new Set(titleTokens).size < titleTokens.length - 1;
  const featureKeys = output.features.map(({ value }) => featureKey(value));
  const uniqueFeatures = new Set(featureKeys).size === featureKeys.length;
  const promotional = /\b(?:best|perfect|revolutionary|ultimate|unmatched|world'?s)\b/iu.test(fields.map(({ value }) => value).join(' '));
  const brand = fixture.facts.find(({ fieldId }) => fieldId === 'brand')!;
  const model = fixture.facts.find(({ fieldId }) => fieldId === 'model')!;
  const productType = fixture.facts.find(({ fieldId }) => fieldId === 'product_type')!;
  const titleOrder = [brand, model, productType].map((fact) => normalized(output.title.value).indexOf(normalized(fact.value)));
  const paragraphCount = output.overview.value.split(/\n\s*\n/gu).filter((paragraph) => paragraph.trim()).length;
  const dimensions = {
    factualAccuracy: criticalFailures.length ? 0 : 25,
    productIdentity: identityVisible ? 10 : 0,
    titleQuality: output.title.value.length <= 140 && !duplicateTitleToken && !promotional ? 10 : 5,
    descriptionQuality: output.overview.value.length >= 40 && !output.overview.value.startsWith(output.title.value) && !promotional ? 15 : 8,
    featureQuality: output.features.length > 0 && uniqueFeatures && output.features.every(({ factIds }) => factIds.length > 0) ? 15 : 7,
    seoQuality: output.seo.title.value.length <= 70 && output.seo.description.value.length <= 320 ? 10 : 5,
    standardCompliance: standard === 'NEOVIX'
      ? (output.title.value.startsWith(brand.value) && titleOrder.every((position, index) => position >= 0 && (index === 0 || position > titleOrder[index - 1]!)) && paragraphCount === 2 && output.features.every(({ value }) => value.startsWith('✔ ')) ? 5 : 0)
      : paragraphCount === 1 && output.features.every(({ value }) => !value.startsWith('✔ ')) ? 5 : 0,
    grammarNaturalness: !/[!?.,]{2,}/u.test(fields.map(({ value }) => value).join(' ')) ? 5 : 2,
    evidencePrecision: irrelevantCitations.length === 0 ? 5 : 0,
  } as const;
  return { total: Object.values(dimensions).reduce<number>((sum, value) => sum + value, 0), dimensions, criticalFailures };
}
