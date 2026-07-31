import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceIssue,
  IssueSeverity,
} from '../domain/types.ts';
import type { Recommendation } from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import {
  boundedHealthScore,
  gradeForHealthScore,
  percentageOf,
  statusForHealthScore,
} from './grade.ts';
import {
  dimensionForRecommendation,
  type ProductHealthEvaluation,
} from './product-health.ts';
import type {
  HealthDimension,
  HealthDimensionId,
} from './types.ts';

function issueDimension(issue: IntelligenceIssue): HealthDimensionId {
  if (typeof issue.metadata.contradictionId === 'string') return 'CONSISTENCY';
  if (typeof issue.metadata.claimGroupId === 'string' || issue.category === 'PRODUCT_TRUTH') {
    return 'PRODUCT_TRUTH';
  }
  if (issue.category === 'SEO') return 'SEO';
  if (issue.category === 'MEDIA') return 'MEDIA';
  if (issue.category === 'VARIANT') return 'VARIANTS';
  if (issue.category === 'PRICING') return 'PRICING';
  if (issue.category === 'SPECIFICATION') return 'SPECIFICATIONS';
  if (issue.category === 'CATALOG_HEALTH') return 'CATALOG_INTEGRITY';
  const identity = `${issue.code} ${issue.affectedFields.join(' ')}`.toLowerCase();
  return /(identity|sku|barcode|handle|vendor|producttype|product_type|title)/.test(identity)
    ? 'IDENTITY'
    : 'DATA_COMPLETENESS';
}

export function evaluateHealthDimensions(input: {
  readonly productEvaluations: readonly ProductHealthEvaluation[];
  readonly issues: readonly IntelligenceIssue[];
  readonly recommendations: readonly Recommendation[];
  readonly assessmentConfidence: number;
  readonly configuration: CatalogHealthConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly HealthDimension[] {
  const total = input.productEvaluations.length;
  const blockersByProduct = new Set(input.productEvaluations
    .filter(({ summary }) => summary.blockerCount > 0)
    .map(({ summary }) => summary.productId));
  return immutableCopy(input.configuration.enabledDimensions.map((dimensionId) => {
    const affected = input.productEvaluations.filter(
      ({ dimensionScores }) => dimensionScores[dimensionId] < 100,
    );
    const dimensionIssues = input.issues.filter((issue) => issueDimension(issue) === dimensionId);
    const dimensionRecommendations = input.recommendations.filter(
      (recommendation) => dimensionForRecommendation(recommendation) === dimensionId,
    );
    const severityCount = (severity: IssueSeverity) => dimensionIssues
      .filter((issue) => issue.severity === severity).length;
    const score = total === 0
      ? 0
      : boundedHealthScore(input.productEvaluations.reduce(
        (sum, { dimensionScores }) => sum + dimensionScores[dimensionId],
        0,
      ) / total);
    const affectedIds = new Set(affected.map(({ summary }) => summary.productId));
    const blockerCount = [...affectedIds].filter((id) => blockersByProduct.has(id)).length;
    const factors = [
      {
        code: 'AFFECTED_PRODUCTS',
        contribution: -percentageOf(affected.length, total),
        explanation: `${affected.length} of ${total} products have findings in this dimension.`,
      },
      {
        code: 'UNIQUE_ROOT_CAUSES',
        contribution: -affected.reduce(
          (sum, { canonicalIssueFamilies }) => sum + canonicalIssueFamilies.length,
          0,
        ),
        explanation: 'Penalties are applied once per canonical root-cause family per product.',
      },
    ];
    const stable = {
      dimensionId,
      score,
      productFingerprints: input.productEvaluations
        .map(({ summary }) => summary.fingerprint)
        .sort(),
      issueFingerprints: dimensionIssues.map(({ fingerprint }) => fingerprint).sort(),
      recommendationFingerprints: dimensionRecommendations.map(({ fingerprint }) => fingerprint).sort(),
    };
    return {
      dimensionId,
      score,
      grade: gradeForHealthScore(score, input.configuration),
      status: statusForHealthScore({
        score,
        assessmentConfidence: input.assessmentConfidence,
        blockedPercentage: percentageOf(blockerCount, total),
        configuration: input.configuration,
      }),
      assessmentConfidence: input.assessmentConfidence,
      productsEvaluated: total,
      affectedProducts: affected.length,
      affectedPercentage: percentageOf(affected.length, total),
      blockerCount,
      criticalIssueCount: severityCount('CRITICAL'),
      highIssueCount: severityCount('HIGH'),
      mediumIssueCount: severityCount('MEDIUM'),
      lowIssueCount: severityCount('LOW'),
      recommendationCount: dimensionRecommendations.length,
      explanationFactors: factors,
      fingerprint: input.hasher.hash(stable),
    };
  }).sort((left, right) => left.dimensionId.localeCompare(right.dimensionId))) as
    readonly HealthDimension[];
}
