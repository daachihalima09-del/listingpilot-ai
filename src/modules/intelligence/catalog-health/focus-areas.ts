import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  MerchantEffort,
  Recommendation,
  RecommendationImpact,
  RecommendationPlan,
} from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import { dimensionForRecommendation } from './product-health.ts';
import type {
  CatalogFocusArea,
  CatalogProblem,
} from './types.ts';

const impactRank: Readonly<Record<RecommendationImpact, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
const effortRank: Readonly<Record<MerchantEffort, number>> = {
  TRIVIAL: 1,
  SMALL: 2,
  MEDIUM: 3,
  LARGE: 4,
};
const blockerRank: Readonly<Record<Recommendation['blockingStatus'], number>> = {
  NON_BLOCKING: 1,
  BLOCKED: 2,
  BLOCKER: 3,
};

function maximumByRank<T extends string>(
  values: readonly T[],
  ranks: Readonly<Record<T, number>>,
): T {
  return [...values].sort((left, right) => ranks[right] - ranks[left])[0];
}

export function buildCatalogFocusAreas(input: {
  readonly plan?: RecommendationPlan;
  readonly problems: readonly CatalogProblem[];
  readonly configuration: CatalogHealthConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly CatalogFocusArea[] {
  if (!input.plan) return Object.freeze([]);
  const recommendations = input.plan.groupedRecommendations
    .flatMap(({ recommendations: groupRecommendations }) => groupRecommendations);
  const quickWinIds = new Set(input.plan.quickWins.map(({ id }) => id));
  const selected = recommendations.filter((recommendation) => (
    input.configuration.includeQuickWins
    || !quickWinIds.has(recommendation.id)
    || recommendation.blockingStatus === 'BLOCKER'
  ));
  const byCategory = new Map<string, Recommendation[]>();
  for (const recommendation of selected) {
    const values = byCategory.get(recommendation.category) ?? [];
    values.push(recommendation);
    byCategory.set(recommendation.category, values);
  }
  const problemIdsByRecommendation = new Map<string, string[]>();
  for (const problem of input.problems) {
    for (const recommendationId of problem.relatedRecommendationIds) {
      const ids = problemIdsByRecommendation.get(recommendationId) ?? [];
      ids.push(problem.problemId);
      problemIdsByRecommendation.set(recommendationId, ids);
    }
  }
  const executionIndex = new Map(input.plan.executionOrder.map((id, index) => [id, index]));
  const focusAreas = [...byCategory.entries()].map(([category, categoryRecommendations]) => {
    const ordered = [...categoryRecommendations].sort((left, right) => (
      left.priority - right.priority
      || (executionIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (executionIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
    ));
    const lead = ordered[0];
    const relatedRecommendationIds = ordered.map(({ id }) => id).sort();
    const relatedCatalogProblemIds = [...new Set(relatedRecommendationIds.flatMap(
      (id) => problemIdsByRecommendation.get(id) ?? [],
    ))].sort();
    const affectedProductIds = new Set(ordered.flatMap(({ affectedProductIds }) => affectedProductIds));
    const blockerStatus = maximumByRank(
      ordered.map(({ blockingStatus }) => blockingStatus),
      blockerRank,
    );
    const impact = maximumByRank(ordered.map(({ estimatedImpact }) => estimatedImpact), impactRank);
    const estimatedMerchantEffort = maximumByRank(
      ordered.map(({ estimatedEffort }) => estimatedEffort),
      effortRank,
    );
    const stable = {
      category,
      relatedRecommendationIds,
      relatedCatalogProblemIds,
      blockerStatus,
      impact,
      estimatedMerchantEffort,
    };
    const fingerprint = input.hasher.hash(stable);
    return {
      focusAreaId: `catalog_focus_${input.hasher.hash({ category, relatedRecommendationIds })}`,
      title: lead.title,
      category,
      priority: lead.priority,
      affectedProducts: affectedProductIds.size,
      expectedCatalogHealthDimension: dimensionForRecommendation(lead),
      relatedCatalogProblemIds,
      relatedRecommendationIds,
      blockerStatus,
      estimatedMerchantEffort,
      impact,
      explanation: lead.explanation,
      requiresMerchantApproval: true as const,
      fingerprint,
      executionPosition: Math.min(...ordered.map(
        ({ id }) => executionIndex.get(id) ?? Number.MAX_SAFE_INTEGER,
      )),
    };
  });
  return immutableCopy(focusAreas
    .sort((left, right) => (
      blockerRank[right.blockerStatus] - blockerRank[left.blockerStatus]
      || left.priority - right.priority
      || impactRank[right.impact] - impactRank[left.impact]
      || left.executionPosition - right.executionPosition
      || left.focusAreaId.localeCompare(right.focusAreaId)
    ))
    .slice(0, input.configuration.focusAreaLimit)
    .map(({ executionPosition, ...focusArea }) => {
      void executionPosition;
      return focusArea;
    })) as readonly CatalogFocusArea[];
}
