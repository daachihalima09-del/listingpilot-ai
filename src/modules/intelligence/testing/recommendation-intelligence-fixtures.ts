import type {
  DetectorExecutionRecord,
  IntelligenceIssue,
  IntelligenceRecommendation,
  Recommendation,
} from '../index.ts';
import {
  DeterministicHasher,
  createRecommendationIntelligenceBundle,
} from '../index.ts';
import {
  contextFixture,
  issueFixture,
  recommendationFixture,
  TEST_TIMESTAMP,
} from './fixtures.ts';
import {
  truthFindingFixture,
  truthReportFixture,
} from './ai-detective-fixtures.ts';

export function recommendationIssueFixture(
  overrides: Partial<IntelligenceIssue> = {},
): IntelligenceIssue {
  return issueFixture({
    id: 'issue-recommendation-1',
    fingerprint: 'issue-fingerprint-1',
    detectorId: 'rules.description',
    code: 'PRODUCT_DESCRIPTION_TOO_SHORT',
    title: 'Description too short',
    explanation: 'The description needs merchant attention.',
    category: 'DATA_QUALITY',
    severity: 'LOW',
    affectedFields: ['description'],
    metadata: {
      semanticDetectorId: 'rules:product.description.too_short',
      ruleId: 'product.description.too_short',
      deterministic: true,
    },
    ...overrides,
  });
}

export function sourceRecommendationFixture(
  issueId = 'issue-recommendation-1',
  overrides: Partial<IntelligenceRecommendation> = {},
): IntelligenceRecommendation {
  return recommendationFixture({
    id: `source-recommendation-${issueId}`,
    fingerprint: `source-fingerprint-${issueId}`,
    issueIds: [issueId],
    title: 'Improve the product description',
    explanation: 'Improve the description using merchant-approved product information.',
    estimatedImpact: 'LOW',
    estimatedEffort: 'LOW',
    confidence: {
      value: 0.9,
      level: 'VERY_HIGH',
      strategyVersion: 'fixture',
      factors: [],
    },
    ...overrides,
  });
}

export function truthExecutionFixture(
  claimGroupId = 'truth-group-1',
  findingId = 'truth-finding-1',
): DetectorExecutionRecord {
  return {
    detectorId: 'product-truth.analysis',
    detectorVersion: '1.0.0',
    status: 'COMPLETED',
    startedAt: TEST_TIMESTAMP,
    completedAt: TEST_TIMESTAMP,
    durationMs: 0,
    issueCount: 1,
    warningCount: 0,
    metrics: {},
    metadata: {
      productTruthReport: truthReportFixture([
        truthFindingFixture({ id: findingId, claimGroupId }),
      ]),
    },
  };
}

export function createRecommendationPlanFixture(input: {
  readonly issues?: readonly IntelligenceIssue[];
  readonly recommendations?: readonly IntelligenceRecommendation[];
  readonly detectorExecutions?: readonly DetectorExecutionRecord[];
} = {}) {
  const hasher = new DeterministicHasher();
  const bundle = createRecommendationIntelligenceBundle({ hasher });
  const context = contextFixture({
    capabilityPackIds: [
      'deterministic-quality',
      'product-truth',
      'ai-detective',
      'recommendation-intelligence',
    ],
  });
  const issues = input.issues ?? [recommendationIssueFixture()];
  const recommendations = input.recommendations
    ?? issues.map((issue) => sourceRecommendationFixture(issue.id));
  return bundle.planner.createPlan({
    context,
    issues,
    recommendations,
    detectorExecutions: input.detectorExecutions ?? [],
  });
}

export function plannedRecommendationFixture(
  overrides: Partial<Recommendation> = {},
): Recommendation {
  return {
    id: 'planned-1',
    category: 'DATA_COMPLETENESS',
    title: 'Review data',
    explanation: 'Review the related issue.',
    severity: 'MEDIUM',
    priority: 3,
    confidence: {
      value: 0.9,
      level: 'VERY_HIGH',
      strategyVersion: 'fixture',
      factors: [],
    },
    estimatedImpact: 'MEDIUM',
    estimatedEffort: 'SMALL',
    blockingStatus: 'NON_BLOCKING',
    dependencies: [],
    relatedIssueIds: ['issue-1'],
    relatedTruthFindingIds: [],
    relatedContradictionIds: [],
    affectedProductIds: ['product-1'],
    affectedFields: ['title'],
    fingerprint: 'planned-fingerprint-1',
    metadata: {},
    ...overrides,
  };
}
