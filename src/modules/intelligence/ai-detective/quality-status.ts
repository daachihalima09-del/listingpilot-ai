import { immutableCopy } from '../domain/immutability.ts';
import type { DetectiveQualityStatus, DetectiveReport } from './types.ts';

export interface DetectiveQualityResult {
  readonly status: DetectiveQualityStatus;
  readonly blockingFindingCount: number;
  readonly requiredReviewCount: number;
  readonly recommendedReviewCount: number;
}

export function evaluateDetectiveQualityStatus(
  report: DetectiveReport,
): DetectiveQualityResult {
  const blockingFindingCount = report.findings.filter(
    ({ reviewRequirement }) => reviewRequirement === 'BLOCKING',
  ).length;
  const requiredReviewCount = report.findings.filter(
    ({ reviewRequirement }) => reviewRequirement === 'REQUIRED',
  ).length;
  const recommendedReviewCount = report.findings.filter(
    ({ reviewRequirement }) => reviewRequirement === 'OPTIONAL',
  ).length;
  const status: DetectiveQualityStatus = blockingFindingCount > 0
    ? 'BLOCKED'
    : requiredReviewCount > 0
      ? 'REVIEW_REQUIRED'
      : recommendedReviewCount > 0
        ? 'REVIEW_RECOMMENDED'
        : 'CLEAR';
  return immutableCopy({
    status,
    blockingFindingCount,
    requiredReviewCount,
    recommendedReviewCount,
  }) as DetectiveQualityResult;
}
