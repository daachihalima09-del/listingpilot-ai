import type {
  CatalogHealthReportInput,
  DetectiveFinding,
  DetectiveReport,
  DetectorExecutionRecord,
  IntelligenceIssue,
  NormalizedProduct,
  Recommendation,
  RecommendationGroup,
  RecommendationPlan,
  TruthFinding,
} from '../index.ts';
import { contradictionFixture, truthFindingFixture, truthReportFixture } from './ai-detective-fixtures.ts';
import {
  contextFixture,
  issueFixture,
  productFixture,
  TEST_TIMESTAMP,
} from './fixtures.ts';
import { plannedRecommendationFixture } from './recommendation-intelligence-fixtures.ts';

export function healthProductFixture(
  id = 'product-1',
  overrides: Partial<NormalizedProduct> = {},
): NormalizedProduct {
  return productFixture({
    id,
    sourceReferences: [{
      sourceType: 'COMMERCE_PLATFORM',
      externalId: `external-${id}`,
      retrievedAt: TEST_TIMESTAMP,
      metadata: {},
    }],
    evidenceIds: [`evidence-${id}`],
    ...overrides,
  });
}

export function healthIssueFixture(
  id = 'issue-1',
  productId = 'product-1',
  overrides: Partial<IntelligenceIssue> = {},
): IntelligenceIssue {
  return issueFixture({
    id,
    fingerprint: `fingerprint-${id}`,
    affectedProductIds: [productId],
    metadata: {
      semanticDetectorId: `rule:${id}`,
      ruleId: id,
      deterministic: true,
    },
    ...overrides,
  });
}

export function healthTruthFindingFixture(
  productId = 'product-1',
  overrides: Partial<TruthFinding> = {},
): TruthFinding {
  return truthFindingFixture({
    id: `truth-${productId}`,
    productId,
    claimGroupId: `truth-group-${productId}`,
    deterministicFingerprint: `truth-fingerprint-${productId}`,
    ...overrides,
  });
}

export function healthDetectiveFindingFixture(
  productId = 'product-1',
  overrides: Partial<DetectiveFinding> = {},
): DetectiveFinding {
  const contradiction = contradictionFixture({
    id: `contradiction-${productId}`,
    productId,
    affectedProductIds: [productId],
    fingerprint: `contradiction-fingerprint-${productId}`,
  });
  return {
    id: `detective-finding-${productId}`,
    contradiction,
    status: 'OPEN',
    reviewRequirement: 'REQUIRED',
    confidence: contradiction.confidence,
    explanation: contradiction.explanation,
    recommendationIds: contradiction.recommendationIds,
    fingerprint: `detective-fingerprint-${productId}`,
    metadata: { deterministic: true },
    ...overrides,
  };
}

export function healthRecommendationFixture(
  id = 'planned-1',
  productId = 'product-1',
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return plannedRecommendationFixture({
    id,
    affectedProductIds: [productId],
    fingerprint: `recommendation-fingerprint-${id}`,
    ...overrides,
  });
}

export function healthRecommendationPlanFixture(
  recommendations: readonly Recommendation[] = [],
  productsAnalyzed = 1,
): RecommendationPlan {
  const groups = recommendations.length === 0
    ? []
    : [{
      id: 'recommendation-group-fixture',
      name: 'Fixture recommendations',
      description: 'Deterministic recommendations for Catalog Health tests.',
      category: recommendations[0].category,
      recommendations,
      estimatedEffort: 'MEDIUM',
      estimatedImpact: 'HIGH',
      completionDependencies: [],
      fingerprint: `group-${recommendations.map(({ fingerprint }) => fingerprint).join('-')}`,
    } satisfies RecommendationGroup];
  const blockers = recommendations.filter(({ blockingStatus }) => blockingStatus === 'BLOCKER');
  const quickWins = recommendations.filter(({ estimatedEffort, estimatedImpact }) => (
    estimatedEffort === 'TRIVIAL' || (
      estimatedEffort === 'SMALL'
      && (estimatedImpact === 'HIGH' || estimatedImpact === 'CRITICAL')
    )
  ));
  return {
    schemaVersion: '1.0.0',
    capabilityId: 'recommendation-intelligence',
    capabilityVersion: '1.0.0',
    productsAnalyzed,
    totalRecommendations: recommendations.length,
    groupedRecommendations: groups,
    executionOrder: recommendations.map(({ id }) => id),
    highestPriority: recommendations.length === 0
      ? null
      : Math.min(...recommendations.map(({ priority }) => priority)) as Recommendation['priority'],
    blockers,
    quickWins,
    longTermImprovements: recommendations.filter(({ estimatedEffort }) => (
      estimatedEffort === 'MEDIUM' || estimatedEffort === 'LARGE'
    )),
    summary: {
      blockerCount: blockers.length,
      quickWinCount: quickWins.length,
      recommendationCount: recommendations.length,
      groupCount: groups.length,
      estimatedMerchantEffort: 'MEDIUM',
      publishingReadiness: blockers.length > 0 ? 'BLOCKED' : 'READY',
    },
    fingerprint: `plan-${recommendations.map(({ fingerprint }) => fingerprint).join('-')}`,
    createdAt: TEST_TIMESTAMP,
  };
}

export function healthDetectorExecutions(input: {
  readonly products: readonly NormalizedProduct[];
  readonly truthFindings?: readonly TruthFinding[];
  readonly detectiveFindings?: readonly DetectiveFinding[];
  readonly includeRules?: boolean;
  readonly includeTruth?: boolean;
  readonly includeDetective?: boolean;
}): readonly DetectorExecutionRecord[] {
  const executions: DetectorExecutionRecord[] = [];
  const base = (detectorId: string): DetectorExecutionRecord => ({
    detectorId,
    detectorVersion: '1.0.0',
    status: 'COMPLETED',
    startedAt: TEST_TIMESTAMP,
    completedAt: TEST_TIMESTAMP,
    durationMs: 0,
    issueCount: 0,
    warningCount: 0,
    metrics: {},
  });
  if (input.includeRules !== false) executions.push(base('rules.fixture'));
  if (input.includeTruth !== false) {
    const findings = input.truthFindings
      ?? input.products.map(({ id }) => healthTruthFindingFixture(id));
    executions.push({
      ...base('product-truth.analysis'),
      metadata: {
        productTruthReport: truthReportFixture(findings, {
          productCount: input.products.length,
          evidenceSourceDistribution: { COMMERCE_PLATFORM: input.products.length },
          deterministicFingerprint: `truth-report-${findings
            .map(({ deterministicFingerprint }) => deterministicFingerprint)
            .sort()
            .join('-')}`,
        }),
      },
    });
  }
  if (input.includeDetective !== false) {
    const findings = input.detectiveFindings ?? [];
    const detectiveReport: DetectiveReport = {
      schemaVersion: '1.0.0',
      capabilityId: 'ai-detective',
      capabilityVersion: '1.0.0',
      productsAnalyzed: input.products.length,
      contradictionsFound: findings.length,
      contradictionsBySeverity: {
        INFO: findings.filter(({ contradiction }) => contradiction.severity === 'INFO').length,
        LOW: findings.filter(({ contradiction }) => contradiction.severity === 'LOW').length,
        MEDIUM: findings.filter(({ contradiction }) => contradiction.severity === 'MEDIUM').length,
        HIGH: findings.filter(({ contradiction }) => contradiction.severity === 'HIGH').length,
        CRITICAL: findings.filter(({ contradiction }) => (
          contradiction.severity === 'CRITICAL'
        )).length,
      },
      contradictionsByType: {
        VALUE_CONFLICT: findings.filter(({ contradiction }) => (
          contradiction.type === 'VALUE_CONFLICT'
        )).length,
        DUPLICATE_IDENTITY: 0,
        IMPOSSIBLE_COMBINATION: 0,
        SUSPICIOUS_COMBINATION: 0,
        WEAK_EVIDENCE: 0,
        TRUTH_LISTING_MISMATCH: 0,
      },
      blockedProducts: [...new Set(findings
        .filter(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')
        .flatMap(({ contradiction }) => contradiction.affectedProductIds))].sort(),
      reviewRequired: findings.filter(({ reviewRequirement }) => (
        reviewRequirement === 'REQUIRED' || reviewRequirement === 'BLOCKING'
      )).length,
      findings,
      warnings: [],
      fingerprint: `detective-report-${findings.map(({ fingerprint }) => fingerprint).sort().join('-')}`,
      createdAt: TEST_TIMESTAMP,
    };
    executions.push({
      ...base('ai-detective.report'),
      metadata: { detectiveReport },
    });
  }
  return executions;
}

export function catalogHealthInputFixture(input: {
  readonly products?: readonly NormalizedProduct[];
  readonly issues?: readonly IntelligenceIssue[];
  readonly truthFindings?: readonly TruthFinding[];
  readonly detectiveFindings?: readonly DetectiveFinding[];
  readonly recommendations?: readonly Recommendation[];
  readonly includeRules?: boolean;
  readonly includeTruth?: boolean;
  readonly includeDetective?: boolean;
  readonly includeRecommendationPlan?: boolean;
} = {}): CatalogHealthReportInput {
  const products = input.products ?? [healthProductFixture()];
  const recommendations = input.recommendations ?? [];
  return {
    context: contextFixture({
      products,
      evidence: [],
      capabilityPackIds: [
        'deterministic-quality',
        'product-truth',
        'ai-detective',
        'recommendation-intelligence',
        'catalog-health',
      ],
    }),
    issues: input.issues ?? [],
    detectorExecutions: healthDetectorExecutions({
      products,
      truthFindings: input.truthFindings,
      detectiveFindings: input.detectiveFindings,
      includeRules: input.includeRules,
      includeTruth: input.includeTruth,
      includeDetective: input.includeDetective,
    }),
    ...(input.includeRecommendationPlan === false
      ? {}
      : {
        recommendationPlan: healthRecommendationPlanFixture(
          recommendations,
          products.length,
        ),
      }),
  };
}
