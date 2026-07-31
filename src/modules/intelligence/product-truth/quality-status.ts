import { immutableCopy } from '../domain/immutability.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import type {
  ClaimImportance,
  ProductTruthQualityStatus,
  ProductTruthReport,
} from './types.ts';

const importanceRank: Readonly<Record<ClaimImportance, number>> = {
  INFORMATIONAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface ProductTruthQualityResult {
  readonly status: ProductTruthQualityStatus;
  readonly blockingFindingCount: number;
  readonly requiredReviewCount: number;
  readonly recommendedReviewCount: number;
  readonly evidenceCount: number;
}

export function evaluateProductTruthQualityStatus(
  report: ProductTruthReport,
  configuration: ProductTruthConfiguration,
): ProductTruthQualityResult {
  const evidenceCount = Object.values(report.evidenceSourceDistribution)
    .reduce((sum, count) => sum + count, 0);
  const blockingMinimum = Math.min(...configuration.blockingImportances.map(
    (importance) => importanceRank[importance],
  ), Number.POSITIVE_INFINITY);
  const blockingFindingCount = report.findings.filter((finding) => (
    finding.reviewRequirement === 'BLOCKING'
    || (
      importanceRank[finding.importance] >= blockingMinimum
      && ['CONFLICTED', 'UNRESOLVED', 'INSUFFICIENT_EVIDENCE'].includes(finding.status)
    )
  )).length;
  const requiredReviewCount = report.findings.filter(({ reviewRequirement }) => (
    reviewRequirement === 'REQUIRED'
  )).length;
  const recommendedReviewCount = report.findings.filter((finding) => (
    finding.reviewRequirement === 'OPTIONAL'
    || finding.status === 'LIKELY'
    || finding.evidenceSummary.missingProvenanceCount > 0
  )).length;
  const status: ProductTruthQualityStatus = evidenceCount === 0
    ? 'NO_EVIDENCE'
    : blockingFindingCount > 0
      ? 'BLOCKED'
      : requiredReviewCount > 0
        ? 'REVIEW_REQUIRED'
        : recommendedReviewCount > 0
          ? 'REVIEW_RECOMMENDED'
          : 'TRUSTED';
  return immutableCopy({
    status,
    blockingFindingCount,
    requiredReviewCount,
    recommendedReviewCount,
    evidenceCount,
  }) as ProductTruthQualityResult;
}
