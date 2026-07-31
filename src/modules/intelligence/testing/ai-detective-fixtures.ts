import type {
  Contradiction,
  DetectiveEvaluationDependencies,
  IntelligenceContext,
  ProductTruthReport,
  TruthFinding,
  TruthResolutionStatus,
} from '../index.ts';
import {
  AIDetectiveConfidenceStrategy,
  DeterministicHasher,
  createAIDetectiveConfiguration,
  createDefaultContradictionRuleRegistry,
} from '../index.ts';
import { contextFixture, TEST_TIMESTAMP } from './fixtures.ts';

export function truthFindingFixture(overrides: Partial<TruthFinding> = {}): TruthFinding {
  return {
    id: 'truth-finding-1',
    productId: 'product-1',
    claimGroupId: 'truth-group-1',
    fieldPath: 'title',
    claimLabel: 'Product title',
    importance: 'HIGH',
    status: 'VERIFIED',
    selectedValue: 'Generic product',
    candidateValues: ['Generic product'],
    confidence: {
      value: 0.92,
      level: 'VERY_HIGH',
      strategyVersion: '1.0.0',
      factors: [],
    },
    confidenceMeaning: 'SELECTED_CANDIDATE',
    evidenceSummary: {
      evidenceCount: 2,
      independentSourceCount: 2,
      strongestAuthority: 'MANUFACTURER_STRUCTURED',
      missingProvenanceCount: 0,
    },
    conflictSummary: {
      materiallySupportedCandidateCount: 1,
      conflictingEvidenceCount: 0,
      hasMaterialConflict: false,
    },
    explanation: 'Two independent authoritative sources agree.',
    reviewRequirement: 'NONE',
    associatedIssueIds: [],
    associatedRecommendationIds: [],
    deterministicFingerprint: 'truth-fingerprint-1',
    metadata: {
      supportingEvidenceIds: ['evidence-a', 'evidence-b'],
      conflictingEvidenceIds: [],
    },
    ...overrides,
  };
}

export function truthReportFixture(
  findings: readonly TruthFinding[] = [truthFindingFixture()],
  overrides: Partial<ProductTruthReport> = {},
): ProductTruthReport {
  const count = (status: TruthResolutionStatus) => findings.filter(
    (finding) => finding.status === status,
  ).length;
  return {
    schemaVersion: '1.0.0',
    capabilityId: 'product-truth',
    capabilityVersion: '1.0.0',
    analysisScope: 'FULL_CATALOG',
    productCount: new Set(findings.map(({ productId }) => productId)).size,
    claimCount: findings.length,
    claimGroupCount: findings.length,
    resolvedCount: findings.filter(({ status }) => (
      status === 'VERIFIED' || status === 'LIKELY' || status === 'MERCHANT_OVERRIDE'
    )).length,
    verifiedCount: count('VERIFIED'),
    likelyCount: count('LIKELY'),
    conflictedCount: count('CONFLICTED'),
    unresolvedCount: count('UNRESOLVED'),
    insufficientEvidenceCount: count('INSUFFICIENT_EVIDENCE'),
    merchantOverrideCount: count('MERCHANT_OVERRIDE'),
    notApplicableCount: count('NOT_APPLICABLE'),
    findings,
    confidenceDistribution: {},
    evidenceSourceDistribution: {},
    resolutionStrategyStatistics: {},
    warnings: [],
    deterministicFingerprint: 'product-truth-report-fingerprint',
    createdAt: TEST_TIMESTAMP,
    ...overrides,
  };
}

export function detectiveDependencies(input: {
  readonly context?: IntelligenceContext;
  readonly truthReport?: ProductTruthReport;
} = {}): DetectiveEvaluationDependencies {
  return {
    context: input.context ?? contextFixture(),
    truthReport: input.truthReport ?? truthReportFixture(),
    configuration: createAIDetectiveConfiguration(),
    rules: createDefaultContradictionRuleRegistry(),
    confidenceStrategy: new AIDetectiveConfidenceStrategy(),
    hasher: new DeterministicHasher(),
  };
}

export function contradictionFixture(overrides: Partial<Contradiction> = {}): Contradiction {
  return {
    id: 'contradiction-1',
    productId: 'product-1',
    affectedProductIds: ['product-1'],
    affectedVariantIds: [],
    type: 'VALUE_CONFLICT',
    severity: 'HIGH',
    confidence: {
      value: 0.9,
      level: 'VERY_HIGH',
      strategyVersion: '1.0.0',
      factors: [],
    },
    explanation: 'Two supported title claims conflict, so merchant review is required.',
    involvedClaims: [{
      productId: 'product-1',
      namespace: 'product',
      key: 'title',
      fieldPath: 'title',
      displayValue: 'First',
      source: 'PRODUCT_TRUTH',
      metadata: { truthFindingId: 'truth-finding-1' },
    }],
    involvedTruthFindingIds: ['truth-finding-1'],
    involvedEvidenceIds: ['evidence-a', 'evidence-b'],
    recommendationIds: ['detective-recommendation-1'],
    ruleId: 'detective.truth.value-conflict',
    ruleVersion: '1.0.0',
    fingerprint: 'contradiction-fingerprint-1',
    metadata: {
      recommendationTemplate: 'Review the conflicting claims.',
      detectorFamily: 'truth-conflict',
      deterministic: true,
    },
    ...overrides,
  };
}
