import { aggregateEffort } from './impact-effort.ts';
import type {
  Recommendation,
  RecommendationPlanSummary,
} from './types.ts';

export function createRecommendationPlanSummary(input: {
  readonly recommendations: readonly Recommendation[];
  readonly groupCount: number;
  readonly quickWinIds: ReadonlySet<string>;
}): RecommendationPlanSummary {
  const blockerCount = input.recommendations.filter(
    ({ blockingStatus }) => blockingStatus === 'BLOCKER',
  ).length;
  const requiredReview = input.recommendations.some(
    ({ priority, severity }) => priority <= 2 || severity === 'HIGH' || severity === 'CRITICAL',
  );
  return {
    blockerCount,
    quickWinCount: input.quickWinIds.size,
    recommendationCount: input.recommendations.length,
    groupCount: input.groupCount,
    estimatedMerchantEffort: aggregateEffort(
      input.recommendations.map(({ estimatedEffort }) => estimatedEffort),
    ),
    publishingReadiness: blockerCount > 0
      ? 'BLOCKED'
      : requiredReview
        ? 'REVIEW_REQUIRED'
        : input.recommendations.length > 0
          ? 'REVIEW_RECOMMENDED'
          : 'READY',
  };
}
