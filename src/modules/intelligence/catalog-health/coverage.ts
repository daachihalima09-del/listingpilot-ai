import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  DetectorExecutionRecord,
  IntelligenceContext,
} from '../domain/types.ts';
import type { CatalogHealthUpstreamReports } from './upstream.ts';
import { boundedHealthScore, percentageOf } from './grade.ts';
import type { CatalogCoverageSummary } from './types.ts';

function completedRuleAnalysis(executions: readonly DetectorExecutionRecord[]): boolean {
  return executions.some(({ detectorId, status }) => (
    detectorId.startsWith('rules.') && status === 'COMPLETED'
  ));
}

export function evaluateCatalogCoverage(input: {
  readonly context: IntelligenceContext;
  readonly detectorExecutions: readonly DetectorExecutionRecord[];
  readonly upstream: CatalogHealthUpstreamReports;
  readonly hasher: IntelligenceHasher;
}): CatalogCoverageSummary {
  const total = input.context.products.length;
  const truthProducts = new Set(input.upstream.productTruth?.findings.map(({ productId }) => productId));
  const evidenceProducts = new Set(input.context.products
    .filter(({ evidenceIds }) => evidenceIds.length > 0)
    .map(({ id }) => id));
  for (const finding of input.upstream.productTruth?.findings ?? []) {
    if (finding.evidenceSummary.evidenceCount > 0) evidenceProducts.add(finding.productId);
  }
  const provenanceProducts = new Set(input.upstream.productTruth?.findings
    .filter(({ evidenceSummary }) => (
      evidenceSummary.evidenceCount > 0 && evidenceSummary.missingProvenanceCount === 0
    ))
    .map(({ productId }) => productId));
  const missingCapabilities = [
    ...(!completedRuleAnalysis(input.detectorExecutions) ? ['deterministic-quality'] : []),
    ...(!input.upstream.productTruth ? ['product-truth'] : []),
    ...(!input.upstream.detective ? ['ai-detective'] : []),
    ...(!input.upstream.recommendationPlan ? ['recommendation-intelligence'] : []),
  ];
  const capabilityCounts = {
    deterministicQuality: completedRuleAnalysis(input.detectorExecutions) ? total : 0,
    productTruth: input.upstream.productTruth?.productCount ?? 0,
    aiDetective: input.upstream.detective?.productsAnalyzed ?? 0,
    recommendationIntelligence: input.upstream.recommendationPlan?.productsAnalyzed ?? 0,
  };
  const capabilityCoverage = total === 0
    ? 0
    : Object.values(capabilityCounts)
      .reduce((sum, count) => sum + Math.min(total, count), 0) / (total * 4) * 100;
  const evidenceCoveragePercentage = percentageOf(evidenceProducts.size, total);
  const provenanceCoveragePercentage = percentageOf(provenanceProducts.size, total);
  const completenessPercentage = boundedHealthScore(
    capabilityCoverage * 0.6
    + evidenceCoveragePercentage * 0.25
    + provenanceCoveragePercentage * 0.15,
  );
  const stable = {
    total,
    capabilityCounts,
    truthProductIds: [...truthProducts].sort(),
    evidenceProductIds: [...evidenceProducts].sort(),
    provenanceProductIds: [...provenanceProducts].sort(),
    missingCapabilities,
  };
  return immutableCopy({
    totalProductsSupplied: total,
    productsNormalized: total,
    productsAnalyzedByCapability: capabilityCounts,
    productsWithProductTruthFindings: truthProducts.size,
    productsWithSufficientEvidence: evidenceProducts.size,
    productsWithDetectiveEvaluation: input.upstream.detective ? total : 0,
    productsWithRecommendationPlans: input.upstream.recommendationPlan ? total : 0,
    productsExcluded: 0,
    exclusionReasons: {},
    completenessPercentage,
    evidenceCoveragePercentage,
    provenanceCoveragePercentage,
    confidenceImpact: boundedHealthScore(100 - completenessPercentage),
    missingCapabilities,
    fingerprint: input.hasher.hash(stable),
  }) as CatalogCoverageSummary;
}

export function evaluateAssessmentConfidence(input: {
  readonly coverage: CatalogCoverageSummary;
  readonly totalProducts: number;
  readonly configuration: import('./configuration.ts').CatalogHealthConfiguration;
}): number {
  const total = input.totalProducts;
  if (total === 0) return 0;
  const counts = input.coverage.productsAnalyzedByCapability;
  const capabilityCoverage = (
    Math.min(total, counts.deterministicQuality)
    + Math.min(total, counts.productTruth)
    + Math.min(total, counts.aiDetective)
    + Math.min(total, counts.recommendationIntelligence)
  ) / (total * 4) * 100;
  const detectiveCoverage = percentageOf(counts.aiDetective, total);
  const recommendationCoverage = percentageOf(counts.recommendationIntelligence, total);
  const weights = input.configuration.assessmentConfidenceWeights;
  return boundedHealthScore(
    capabilityCoverage * weights.capabilityCoverage / 100
    + input.coverage.evidenceCoveragePercentage * weights.evidenceCoverage / 100
    + input.coverage.provenanceCoveragePercentage * weights.provenanceCoverage / 100
    + detectiveCoverage * weights.detectiveCoverage / 100
    + recommendationCoverage * weights.recommendationCoverage / 100,
  );
}
