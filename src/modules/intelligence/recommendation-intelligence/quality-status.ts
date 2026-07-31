import { immutableCopy } from '../domain/immutability.ts';
import type {
  RecommendationPlan,
  RecommendationPlanQualityStatus,
} from './types.ts';

export interface RecommendationPlanQualityResult {
  readonly status: RecommendationPlanQualityStatus;
  readonly blockerCount: number;
  readonly requiredReviewCount: number;
  readonly quickWinCount: number;
}

export function evaluateRecommendationPlanQuality(
  plan: RecommendationPlan,
): RecommendationPlanQualityResult {
  return immutableCopy({
    status: plan.summary.publishingReadiness,
    blockerCount: plan.blockers.length,
    requiredReviewCount: plan.groupedRecommendations
      .flatMap(({ recommendations }) => recommendations)
      .filter(({ priority }) => priority <= 2).length,
    quickWinCount: plan.quickWins.length,
  }) as RecommendationPlanQualityResult;
}
