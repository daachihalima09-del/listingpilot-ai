import type { IntelligenceReport } from '../domain/types.ts';
import type {
  IntelligenceReportContributionInput,
  IntelligenceReportContributor,
} from '../engine/report-contributor.ts';
import {
  RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
  RECOMMENDATION_INTELLIGENCE_VERSION,
} from './configuration.ts';
import type { RecommendationPlanner } from './plan.ts';
import type { RecommendationPlan } from './types.ts';

export const RECOMMENDATION_PLAN_METADATA_KEY = 'recommendationPlan';

export class RecommendationIntelligenceReportContributor
implements IntelligenceReportContributor {
  readonly id = 'recommendation-intelligence.plan';
  readonly version = RECOMMENDATION_INTELLIGENCE_VERSION;
  readonly priority = 1_000;
  readonly metadataKey = RECOMMENDATION_PLAN_METADATA_KEY;
  readonly enabled = true;
  private readonly planner: RecommendationPlanner;

  constructor(planner: RecommendationPlanner) {
    this.planner = planner;
  }

  contribute(input: IntelligenceReportContributionInput): RecommendationPlan | undefined {
    if (!input.context.capabilityPackIds.includes(RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID)) {
      return undefined;
    }
    return this.planner.createPlan({
      context: input.context,
      issues: input.issues,
      recommendations: input.recommendations,
      detectorExecutions: input.detectorExecutions,
    });
  }
}

export function getRecommendationPlan(
  report: IntelligenceReport,
): RecommendationPlan | undefined {
  const value = report.metadata?.[RECOMMENDATION_PLAN_METADATA_KEY];
  return value && typeof value === 'object'
    && (value as RecommendationPlan).capabilityId === RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID
    ? value as RecommendationPlan
    : undefined;
}
