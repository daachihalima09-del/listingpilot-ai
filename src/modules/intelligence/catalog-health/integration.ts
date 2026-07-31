import type { IntelligenceReport } from '../domain/types.ts';
import type {
  IntelligenceReportContributionInput,
  IntelligenceReportContributor,
} from '../engine/report-contributor.ts';
import {
  RECOMMENDATION_PLAN_METADATA_KEY,
} from '../recommendation-intelligence/integration.ts';
import type { RecommendationPlan } from '../recommendation-intelligence/types.ts';
import {
  CATALOG_HEALTH_CAPABILITY_ID,
  CATALOG_HEALTH_VERSION,
} from './configuration.ts';
import type { CatalogHealthReportBuilder } from './report.ts';
import type { CatalogHealthReport } from './types.ts';

export const CATALOG_HEALTH_METADATA_KEY = 'catalogHealth';

export class CatalogHealthReportContributor implements IntelligenceReportContributor {
  readonly id = 'catalog-health.report';
  readonly version = CATALOG_HEALTH_VERSION;
  readonly priority = 2_000;
  readonly metadataKey = CATALOG_HEALTH_METADATA_KEY;
  readonly enabled = true;
  private readonly builder: CatalogHealthReportBuilder;

  constructor(builder: CatalogHealthReportBuilder) {
    this.builder = builder;
  }

  contribute(input: IntelligenceReportContributionInput): CatalogHealthReport | undefined {
    if (!input.context.capabilityPackIds.includes(CATALOG_HEALTH_CAPABILITY_ID)) return undefined;
    const plan = input.priorContributions?.[RECOMMENDATION_PLAN_METADATA_KEY];
    return this.builder.build({
      context: input.context,
      issues: input.issues,
      detectorExecutions: input.detectorExecutions,
      ...(plan && typeof plan === 'object'
        ? { recommendationPlan: plan as RecommendationPlan }
        : {}),
    });
  }
}

export function getCatalogHealthReport(
  report: IntelligenceReport,
): CatalogHealthReport | undefined {
  const value = report.metadata?.[CATALOG_HEALTH_METADATA_KEY];
  return value && typeof value === 'object'
    && (value as CatalogHealthReport).capabilityId === CATALOG_HEALTH_CAPABILITY_ID
    ? value as CatalogHealthReport
    : undefined;
}
