import type {
  CapabilityPack,
  DetectorMetadata,
  DetectorResult,
  Evidence,
  IntelligenceContext,
  IntelligenceDetector,
  IntelligenceIssue,
  IntelligenceRecommendation,
  KnowledgePack,
  NormalizedProduct,
} from '../index.ts';

export const TEST_TIMESTAMP = '2026-07-29T10:00:00.000Z';

export function productFixture(overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    id: 'product-1',
    sourceReferences: [{
      sourceType: 'MANUAL',
      externalId: 'external-1',
      retrievedAt: TEST_TIMESTAMP,
      metadata: {},
    }],
    title: 'Generic product',
    description: 'A normalized product.',
    vendor: 'Example vendor',
    productType: 'Generic',
    categories: ['generic'],
    tags: ['example'],
    status: 'ACTIVE',
    specifications: [{
      key: 'material',
      label: 'Material',
      rawValue: 'Steel',
      normalizedValue: 'steel',
      valueType: 'STRING',
      evidenceIds: ['evidence-1'],
    }],
    variants: [{
      id: 'variant-1',
      sourceReferences: [],
      title: 'Default',
      sku: 'EXAMPLE',
      options: {},
      price: '19.9900',
      compareAtPrice: '29.99',
      inventoryAttributes: {},
      measurementMetadata: { weight: '1.250', unit: 'kg' },
      attributes: {},
      evidenceIds: [],
    }],
    media: [{
      id: 'media-1',
      type: 'IMAGE',
      url: 'https://example.test/image.jpg',
      altText: 'Generic product',
      position: 0,
      width: 1000,
      height: 1000,
      sourceIdentity: 'source-media-1',
      evidenceIds: [],
    }],
    seo: {
      title: 'Generic product',
      description: 'A normalized product.',
      handle: 'generic-product',
      canonicalUrl: 'https://example.test/products/generic-product',
      evidenceIds: [],
    },
    attributes: {},
    evidenceIds: ['evidence-1'],
    createdAt: TEST_TIMESTAMP,
    updatedAt: TEST_TIMESTAMP,
    extensions: {},
    ...overrides,
  };
}

export function evidenceFixture(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'evidence-1',
    providerId: 'provider-1',
    type: 'SOURCE_VALUE',
    claim: 'Product title is Generic product',
    affectedField: 'title',
    rawValue: 'Generic product',
    normalizedValue: 'Generic product',
    reliability: 'HIGH',
    freshness: 1,
    priority: 10,
    retrievedAt: TEST_TIMESTAMP,
    metadata: {},
    ...overrides,
  };
}

export function contextFixture(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    workspaceId: 'workspace-1',
    catalogId: 'catalog-1',
    analysisScope: 'FULL_CATALOG',
    products: [productFixture()],
    knowledgePackIds: [],
    capabilityPackIds: [],
    evidence: [evidenceFixture()],
    merchantSettings: { locale: 'en', currency: 'USD', values: {} },
    confidenceThresholds: {
      veryLowMaximum: 0.2,
      lowMaximum: 0.4,
      mediumMaximum: 0.6,
      highMaximum: 0.8,
    },
    options: {
      failFast: false,
      detectorTimeoutMs: 100,
      globalTimeoutMs: 1_000,
      disabledDetectorIds: [],
    },
    execution: {
      executionId: 'execution-1',
      engineVersion: '1.0.0',
      requestedAt: TEST_TIMESTAMP,
      metadata: {},
    },
    cancellation: { isCancellationRequested: false },
    ...overrides,
  };
}

export function issueFixture(overrides: Partial<IntelligenceIssue> = {}): IntelligenceIssue {
  return {
    id: 'issue-1',
    fingerprint: '',
    detectorId: 'detector-1',
    detectorVersion: '1.0.0',
    code: 'GENERIC_ISSUE',
    title: 'Generic issue',
    explanation: 'A generic test issue was detected.',
    category: 'DATA_QUALITY',
    severity: 'MEDIUM',
    status: 'OPEN',
    scope: 'FIELD',
    affectedProductIds: ['product-1'],
    affectedVariantIds: [],
    affectedFields: ['title'],
    evidenceIds: ['evidence-1'],
    recommendationIds: [],
    metadata: { semanticDetectorId: 'generic-family' },
    createdAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function recommendationFixture(
  overrides: Partial<IntelligenceRecommendation> = {},
): IntelligenceRecommendation {
  return {
    id: 'recommendation-1',
    fingerprint: '',
    issueIds: ['issue-1'],
    strategyId: 'strategy-1',
    strategyVersion: '1.0.0',
    title: 'Review product title',
    explanation: 'Review the normalized product title.',
    actionType: 'REVIEW',
    affectedFields: ['title'],
    proposedValues: [],
    priority: 'MEDIUM',
    estimatedImpact: 'MEDIUM',
    estimatedEffort: 'LOW',
    riskLevel: 'LOW',
    automationCapability: 'SUGGEST_ONLY',
    approvalRequirement: 'MERCHANT',
    metadata: {},
    ...overrides,
  };
}

export function detectorFixture(input: {
  readonly id?: string;
  readonly priority?: number;
  readonly metadata?: Partial<DetectorMetadata>;
  readonly execute?: IntelligenceDetector['execute'];
  readonly result?: Partial<DetectorResult>;
} = {}): IntelligenceDetector {
  const id = input.id ?? 'detector-1';
  return {
    metadata: {
      id,
      displayName: id,
      version: '1.0.0',
      description: 'Generic test detector.',
      issueCategories: ['DATA_QUALITY'],
      supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
      requiredCapabilities: [],
      priority: input.priority ?? 100,
      timeoutMs: 100,
      parallelSafe: true,
      enabled: true,
      deterministic: true,
      ...input.metadata,
    },
    execute: input.execute ?? (() => ({
      issues: input.result?.issues ?? [],
      warnings: input.result?.warnings ?? [],
      metrics: input.result?.metrics ?? {},
      metadata: input.result?.metadata ?? {},
    })),
  };
}

export function knowledgePackFixture(overrides: Partial<KnowledgePack> = {}): KnowledgePack {
  return {
    id: 'knowledge-generic',
    name: 'Generic fixture',
    version: '1.0.0',
    description: 'Non-production test fixture.',
    supportedCategories: ['generic'],
    categoryAliases: { generic: ['general'] },
    specificationVocabulary: [],
    requiredFields: [],
    optionalFields: [],
    terminology: {},
    unitNormalization: {},
    confidenceWeights: {},
    dependencies: [],
    validationMetadata: {},
    compatibilityMetadata: {},
    extensionMetadata: {},
    supportedIssueCategories: ['DATA_QUALITY'],
    enabled: true,
    ...overrides,
  };
}

export function capabilityPackFixture(overrides: Partial<CapabilityPack> = {}): CapabilityPack {
  return {
    id: 'capability-generic',
    name: 'Generic capability',
    version: '1.0.0',
    description: 'Non-production test fixture.',
    supportedIssueCategories: ['DATA_QUALITY'],
    requiredContextFeatures: [],
    compatibilityMetadata: {},
    dependencies: [],
    extensionMetadata: {},
    enabled: true,
    ...overrides,
  };
}
