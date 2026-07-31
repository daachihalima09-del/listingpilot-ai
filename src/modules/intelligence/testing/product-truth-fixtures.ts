import type {
  Evidence,
  IntelligenceContext,
  NormalizedProduct,
  ProductClaim,
  ProductTruthAnalysis,
  ProductTruthConfigurationInput,
} from '../index.ts';
import {
  DeterministicHasher,
  createProductTruthBundle,
} from '../index.ts';
import {
  contextFixture,
  evidenceFixture,
  productFixture,
  TEST_TIMESTAMP,
} from './fixtures.ts';

export function truthProductFixture(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  const product = productFixture({
    specifications: [],
    variants: [],
    media: [],
    seo: { evidenceIds: [] },
    attributes: {},
    evidenceIds: [],
  });
  return { ...product, ...overrides };
}

export function truthEvidenceFixture(
  id: string,
  value: unknown,
  overrides: Partial<Evidence> = {},
): Evidence {
  return evidenceFixture({
    id,
    providerId: `provider-${id}`,
    claim: 'Product title claim',
    affectedField: 'title',
    rawValue: value,
    normalizedValue: value,
    reliability: 'HIGH',
    freshness: 1,
    priority: 10,
    sourceReference: {
      sourceType: 'DOCUMENT',
      externalId: id,
      url: `https://evidence.example/${id}`,
      retrievedAt: TEST_TIMESTAMP,
      metadata: {},
    },
    metadata: {
      productId: 'product-1',
      claimNamespace: 'product',
      claimKey: 'title',
      affectedFieldPath: 'title',
      displayLabel: 'Product title',
      valueType: 'STRING',
      providerType: 'MANUFACTURER',
      structured: true,
      direct: true,
      sourceIdentity: `source-${id}`,
      importance: 'HIGH',
    },
    ...overrides,
  });
}

export function truthContextFixture(
  evidence: readonly Evidence[] = [],
  overrides: Partial<IntelligenceContext> = {},
): IntelligenceContext {
  return contextFixture({
    analysisScope: 'SINGLE_PRODUCT',
    products: [truthProductFixture()],
    evidence,
    capabilityPackIds: ['product-truth'],
    options: {
      ...contextFixture().options,
      detectorTimeoutMs: 20_000,
      globalTimeoutMs: 60_000,
    },
    ...overrides,
  });
}

export function analyzeTruth(
  evidence: readonly Evidence[] = [],
  input: {
    readonly context?: Partial<IntelligenceContext>;
    readonly configuration?: ProductTruthConfigurationInput;
  } = {},
): ProductTruthAnalysis {
  const hasher = new DeterministicHasher();
  const bundle = createProductTruthBundle({
    hasher,
    configuration: input.configuration,
  });
  return bundle.analyzer.analyze(truthContextFixture(evidence, input.context));
}

export function productClaimFixture(overrides: Partial<ProductClaim> = {}): ProductClaim {
  return {
    id: 'claim-1',
    productId: 'product-1',
    namespace: 'product',
    key: 'title',
    displayLabel: 'Product title',
    affectedFieldPath: 'title',
    rawValue: 'Example',
    normalizedCandidateValue: 'Example',
    valueType: 'STRING',
    evidenceIds: [],
    sourceReferences: [],
    origin: 'NORMALIZED_PRODUCT',
    importance: 'HIGH',
    createdAt: TEST_TIMESTAMP,
    metadata: {},
    ...overrides,
  };
}
