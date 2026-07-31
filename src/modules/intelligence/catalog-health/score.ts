import { immutableCopy } from '../domain/immutability.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import { boundedHealthScore, percentageOf } from './grade.ts';
import type {
  CatalogHealthScoreExplanation,
  HealthDimension,
  ProductHealthSummary,
} from './types.ts';

export function calculateCatalogHealthScore(input: {
  readonly dimensions: readonly HealthDimension[];
  readonly products: readonly ProductHealthSummary[];
  readonly configuration: CatalogHealthConfiguration;
}): CatalogHealthScoreExplanation {
  if (input.products.length === 0) {
    return immutableCopy({
      weightedDimensionScore: 0,
      blockerPenalty: 0,
      criticalRiskPenalty: 0,
      insufficientAnalysisPenalty: 0,
      finalScore: 0,
      factors: [{
        code: 'EMPTY_CATALOG',
        contribution: 0,
        explanation: 'No products were supplied for analysis.',
      }],
    }) as CatalogHealthScoreExplanation;
  }
  const byId = new Map(input.dimensions.map((dimension) => [dimension.dimensionId, dimension]));
  const enabledWeight = input.configuration.enabledDimensions.reduce(
    (sum, dimension) => sum + input.configuration.dimensionWeights[dimension],
    0,
  );
  const weightedDimensionScore = boundedHealthScore(
    input.configuration.enabledDimensions.reduce((sum, dimension) => (
      sum + (byId.get(dimension)?.score ?? 0)
        * input.configuration.dimensionWeights[dimension] / enabledWeight
    ), 0),
  );
  const blockedProducts = input.products.filter(
    ({ publishingReadiness }) => publishingReadiness === 'BLOCKED',
  ).length;
  const blockedPercentage = percentageOf(blockedProducts, input.products.length);
  const blockerPenalty = boundedHealthScore(Math.min(
    input.configuration.blockerPenalties.maximumCatalogPenalty,
    blockedPercentage * input.configuration.blockerPenalties.catalogPerAffectedPercentage,
  ));
  const criticalProducts = input.products.filter(
    ({ issueCountsBySeverity }) => issueCountsBySeverity.CRITICAL > 0,
  ).length;
  const criticalRiskPenalty = boundedHealthScore(
    percentageOf(criticalProducts, input.products.length)
    * input.configuration.issueSeverityPenalties.CRITICAL / 100,
  );
  const incompleteProducts = input.products.filter(
    ({ metadata }) => metadata.sufficientAnalysis !== true,
  ).length;
  const insufficientAnalysisPenalty = boundedHealthScore(Math.min(
    input.configuration.insufficientAnalysisPenalties.maximumCatalogPenalty,
    percentageOf(incompleteProducts, input.products.length)
      * input.configuration.insufficientAnalysisPenalties.maximumCatalogPenalty / 100,
  ));
  const finalScore = boundedHealthScore(
    weightedDimensionScore
    - blockerPenalty
    - criticalRiskPenalty
    - insufficientAnalysisPenalty,
  );
  return immutableCopy({
    weightedDimensionScore,
    blockerPenalty,
    criticalRiskPenalty,
    insufficientAnalysisPenalty,
    finalScore,
    factors: [
      {
        code: 'WEIGHTED_DIMENSIONS',
        contribution: weightedDimensionScore,
        explanation: 'Enabled dimension scores are combined using configured weights.',
      },
      {
        code: 'BLOCKERS',
        contribution: -blockerPenalty,
        explanation: `${blockedProducts} product(s) have unresolved blocker signals.`,
      },
      {
        code: 'CRITICAL_RISK',
        contribution: -criticalRiskPenalty,
        explanation: `${criticalProducts} product(s) have critical issue signals.`,
      },
      {
        code: 'INSUFFICIENT_ANALYSIS',
        contribution: -insufficientAnalysisPenalty,
        explanation: `${incompleteProducts} product(s) have incomplete upstream analysis.`,
      },
    ],
  }) as CatalogHealthScoreExplanation;
}
