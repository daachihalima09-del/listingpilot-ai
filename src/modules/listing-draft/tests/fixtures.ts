import { createGenerationInstructions } from '../../generation-instructions/index.ts';
import type { GenerationInstructions } from '../../generation-instructions/domain/contracts.ts';
import { createListingGenerationPlan } from '../../listing-generation/index.ts';
import { generationInput } from '../../listing-generation/tests/fixtures.ts';
import type { ListingDraftProviderOutputInput } from '../validation/draft-schema.ts';

export function draftInstructions(): GenerationInstructions {
  return createGenerationInstructions(createListingGenerationPlan(generationInput()));
}

export function validProviderOutput(
  instructions: GenerationInstructions = draftInstructions(),
): ListingDraftProviderOutputInput {
  const byField = new Map(instructions.allowedFacts.map((fact) => [fact.fieldId, fact]));
  const brand = byField.get('brand')!;
  const productType = byField.get('product_type')!;
  const model = byField.get('model')!;
  const resolution = byField.get('resolution')!;
  const size = byField.get('screen_size')!;
  const technology = byField.get('display_technology')!;
  const titleParts = [brand, model, productType, size, technology];
  const titleFacts = titleParts.map(({ factId }) => factId);
  const featureFacts = instructions.allowedFacts.filter(({ allowedUses }) => allowedUses.includes('FEATURES'));
  const targetFeatureCount = Number(instructions.groups.FEATURES.instructions.targetCount);
  const features = Array.from({ length: targetFeatureCount }, (_, index) => {
    const first = featureFacts[index % featureFacts.length]!;
    const second = index >= featureFacts.length
      ? featureFacts[(index + 1) % featureFacts.length]!
      : null;
    return {
      value: `\u2714 ${second ? `${first.value} ${second.value}` : first.value}`,
      factIds: second ? [first.factId, second.factId] : [first.factId],
    };
  });
  const rawFactBlock = instructions.groups.DESCRIPTION.instructions.structuredFactBlock;
  const factBlock = rawFactBlock && typeof rawFactBlock === 'object' && 'fields' in rawFactBlock && Array.isArray(rawFactBlock.fields)
    ? rawFactBlock as { readonly fields: readonly { readonly label: string; readonly factIds: readonly string[]; readonly required: boolean }[] }
    : null;
  const requiredSpecifications = factBlock
    ? factBlock.fields.flatMap((field) => {
        if (!field.required) return [];
        const facts = field.factIds
          .map((factId) => instructions.allowedFacts.find((fact) => fact.factId === factId))
          .filter((fact): fact is GenerationInstructions['allowedFacts'][number] => Boolean(fact));
        return facts.length ? [{ label: field.label, value: facts.map(({ value }) => value).join(' '), factIds: facts.map(({ factId }) => factId) }] : [];
      })
    : [];
  const specifications = requiredSpecifications.some(({ factIds }) => factIds.includes(resolution.factId))
    ? requiredSpecifications
    : [...requiredSpecifications, { label: 'Resolution', value: resolution.value, factIds: [resolution.factId] }];
  return {
    title: { value: titleParts.map(({ value }) => value).join(' '), factIds: titleFacts },
    overview: { value: `${brand.value} ${productType.value}.\n\n${productType.value} from ${brand.value}.`, factIds: [brand.factId, productType.factId] },
    specifications,
    features,
    whatsIncluded: [{ value: `${brand.value} ${productType.value}`, factIds: [brand.factId, productType.factId] }],
    seo: {
      title: { value: titleParts.map(({ value }) => value).join(' '), factIds: titleFacts },
      description: { value: `${brand.value} ${productType.value} with ${resolution.value} resolution.`, factIds: [brand.factId, productType.factId, resolution.factId] },
      handle: { value: 'acme-x1000', factIds: [brand.factId, model.factId] },
    },
    catalog: {
      tags: [{ value: 'Featured', factIds: [] }],
      collections: [{ value: 'Featured', factIds: [] }],
      productType: { value: 'Television', factIds: [productType.factId] },
      vendor: { value: 'Northwind', factIds: [] },
    },
    metafields: [],
    media: [{ imageReference: 'image-1', altText: `${brand.value} ${productType.value}`, factIds: [brand.factId, productType.factId] }],
    reviewNotes: ['Review the complete draft before publishing.'],
    confidence: { overall: 95, summary: 'Selected facts are verified.', fieldNotes: [] },
  };
}
