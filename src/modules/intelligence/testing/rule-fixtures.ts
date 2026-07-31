import { DeterministicHasher } from '../deterministic/services.ts';
import type {
  IntelligenceContext,
  IntelligenceIssue,
  NormalizedProduct,
} from '../domain/types.ts';
import {
  createDeterministicRuleConfiguration,
  type DeterministicRuleConfigurationInput,
} from '../rules/configuration.ts';
import { DETERMINISTIC_QUALITY_CAPABILITY_ID } from '../rules/definitions.ts';
import { createDeterministicRuleDetectors } from '../rules/detectors.ts';
import { createDefaultDeterministicRuleRegistry } from '../rules/factory.ts';
import { contextFixture, productFixture } from './fixtures.ts';

const longDescription = 'A detailed normalized description with enough meaningful text to pass the default deterministic minimum length requirement.';
const longSeoDescription = 'A useful SEO description with enough meaningful text to satisfy the configured deterministic minimum length.';

export function validRuleProductFixture(
  overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
  return productFixture({
    title: 'Unique generic product',
    description: longDescription,
    vendor: 'Example vendor',
    productType: 'Generic product',
    status: 'ACTIVE',
    tags: ['generic', 'example'],
    variants: [{
      ...productFixture().variants[0],
      id: 'variant-1',
      sku: 'UNIQUE-SKU-1',
      barcode: '100000000001',
      price: '19.99',
      compareAtPrice: '29.99',
      options: { Size: 'Default' },
    }],
    media: [{
      ...productFixture().media[0],
      id: 'media-1',
      url: 'https://example.test/media/unique.jpg',
      altText: 'Unique generic product',
      position: 0,
      width: 1000,
      height: 1000,
    }],
    seo: {
      title: 'Unique generic product',
      description: longSeoDescription,
      handle: 'unique-generic-product',
      canonicalUrl: 'https://example.test/products/unique-generic-product',
      evidenceIds: [],
    },
    specifications: [{
      key: 'material',
      label: 'Material',
      rawValue: 'Steel',
      normalizedValue: 'steel',
      valueType: 'STRING',
      evidenceIds: [],
    }],
    ...overrides,
  });
}

export function ruleContextFixture(
  products: readonly NormalizedProduct[],
  overrides: Partial<IntelligenceContext> = {},
): IntelligenceContext {
  return contextFixture({
    products,
    capabilityPackIds: [DETERMINISTIC_QUALITY_CAPABILITY_ID],
    ...overrides,
  });
}

export function evaluateRuleIssues(input: {
  readonly products: readonly NormalizedProduct[];
  readonly configuration?: DeterministicRuleConfigurationInput;
  readonly disabledRuleIds?: readonly string[];
  readonly context?: Partial<IntelligenceContext>;
}): readonly IntelligenceIssue[] {
  const registry = createDefaultDeterministicRuleRegistry();
  for (const id of input.disabledRuleIds ?? []) registry.disable(id);
  const configuration = createDeterministicRuleConfiguration(input.configuration);
  const hasher = new DeterministicHasher();
  const context = ruleContextFixture(input.products, input.context);
  return createDeterministicRuleDetectors({ registry, configuration, hasher })
    .flatMap((detector) => detector.execute(context).issues);
}

export function issuesForRule(
  issues: readonly IntelligenceIssue[],
  ruleId: string,
): readonly IntelligenceIssue[] {
  return issues.filter((issue) => issue.metadata.ruleId === ruleId);
}
