import type {
  DetectorExecutionRecord,
  IntelligenceIssue,
} from '../domain/types.ts';
import { IntelligenceDomainError } from '../domain/errors.ts';
import type { DetectiveReport } from '../ai-detective/types.ts';
import { AI_DETECTIVE_CAPABILITY_ID } from '../ai-detective/configuration.ts';
import type { ProductTruthReport } from '../product-truth/types.ts';
import { PRODUCT_TRUTH_CAPABILITY_ID } from '../product-truth/configuration.ts';
import type {
  Recommendation,
  RecommendationPlan,
} from '../recommendation-intelligence/types.ts';
import { RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID } from '../recommendation-intelligence/configuration.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';

export interface CatalogHealthUpstreamReports {
  readonly productTruth?: ProductTruthReport;
  readonly detective?: DetectiveReport;
  readonly recommendationPlan?: RecommendationPlan;
}

function metadataReport<T>(
  executions: readonly DetectorExecutionRecord[],
  key: string,
  capabilityId: string,
): T | undefined {
  for (const execution of executions) {
    const value = execution.metadata?.[key];
    if (value && typeof value === 'object'
      && (value as { capabilityId?: unknown }).capabilityId === capabilityId) {
      return value as T;
    }
  }
  return undefined;
}

export function collectCatalogHealthUpstreamReports(input: {
  readonly detectorExecutions: readonly DetectorExecutionRecord[];
  readonly recommendationPlan?: RecommendationPlan;
}): CatalogHealthUpstreamReports {
  return Object.freeze({
    productTruth: metadataReport<ProductTruthReport>(
      input.detectorExecutions,
      'productTruthReport',
      PRODUCT_TRUTH_CAPABILITY_ID,
    ),
    detective: metadataReport<DetectiveReport>(
      input.detectorExecutions,
      'detectiveReport',
      AI_DETECTIVE_CAPABILITY_ID,
    ),
    ...(input.recommendationPlan?.capabilityId === RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID
      ? { recommendationPlan: input.recommendationPlan }
      : {}),
  });
}

export function recommendationsFromPlan(
  plan: RecommendationPlan | undefined,
): readonly Recommendation[] {
  if (!plan) return [];
  const recommendations = plan.groupedRecommendations
    .flatMap(({ recommendations: groupRecommendations }) => groupRecommendations);
  const byId = new Map<string, Recommendation>();
  for (const recommendation of recommendations) {
    if (!recommendation.id?.trim() || !recommendation.fingerprint?.trim()
      || byId.has(recommendation.id)) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        `Duplicate or malformed Recommendation Intelligence ID ${recommendation.id}.`,
      );
    }
    if (![1, 2, 3, 4, 5].includes(recommendation.priority)
      || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(recommendation.estimatedImpact)
      || !['TRIVIAL', 'SMALL', 'MEDIUM', 'LARGE'].includes(recommendation.estimatedEffort)
      || !['BLOCKER', 'BLOCKED', 'NON_BLOCKING'].includes(recommendation.blockingStatus)) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        `Recommendation ${recommendation.id} contains an unsupported status or level.`,
      );
    }
    byId.set(recommendation.id, recommendation);
  }
  for (const recommendation of byId.values()) {
    for (const dependency of recommendation.dependencies) {
      if (!byId.has(dependency)) {
        throw new IntelligenceDomainError(
          'INVALID_CONTEXT',
          `Recommendation ${recommendation.id} has missing dependency ${dependency}.`,
        );
      }
    }
  }
  const executionOrder = [...plan.executionOrder];
  if (new Set(executionOrder).size !== executionOrder.length
    || executionOrder.length !== byId.size
    || executionOrder.some((id) => !byId.has(id))
    || plan.totalRecommendations !== byId.size) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Recommendation Plan execution order and totals must match its stable recommendations.',
    );
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function canonicalIssueFamily(
  issue: IntelligenceIssue,
  configuration: CatalogHealthConfiguration,
): string {
  for (const key of configuration.antiDoubleCounting.canonicalMetadataKeys) {
    const value = issue.metadata[key];
    if (typeof value === 'string' && value.trim()) return `${key}:${value.trim()}`;
  }
  return `${issue.detectorId}:${issue.code}`;
}
