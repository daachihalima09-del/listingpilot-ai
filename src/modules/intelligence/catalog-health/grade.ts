import type { CatalogHealthConfiguration } from './configuration.ts';
import type {
  CatalogHealthGrade,
  CatalogHealthStatus,
} from './types.ts';

export function boundedHealthScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}

export function percentageOf(count: number, total: number): number {
  return total === 0 ? 0 : boundedHealthScore((count / total) * 100);
}

export function gradeForHealthScore(
  score: number,
  configuration: CatalogHealthConfiguration,
): CatalogHealthGrade {
  if (score >= configuration.healthGradeThresholds.A) return 'A';
  if (score >= configuration.healthGradeThresholds.B) return 'B';
  if (score >= configuration.healthGradeThresholds.C) return 'C';
  if (score >= configuration.healthGradeThresholds.D) return 'D';
  return 'F';
}

export function statusForHealthScore(input: {
  readonly score: number;
  readonly assessmentConfidence: number;
  readonly blockedPercentage: number;
  readonly configuration: CatalogHealthConfiguration;
}): CatalogHealthStatus {
  const thresholds = input.configuration.healthStatusThresholds;
  if (input.assessmentConfidence < thresholds.insufficientConfidenceBelow
    || input.assessmentConfidence < input.configuration.minimumCoveragePercentage) {
    return 'INSUFFICIENT_ANALYSIS';
  }
  if (input.blockedPercentage >= thresholds.criticalBlockedPercentage) return 'CRITICAL';
  if (input.score >= thresholds.excellentMinimum
    && input.blockedPercentage <= thresholds.excellentMaximumBlockedPercentage) {
    return 'EXCELLENT';
  }
  if (input.score >= thresholds.healthyMinimum) return 'HEALTHY';
  if (input.score >= thresholds.needsAttentionMinimum) return 'NEEDS_ATTENTION';
  if (input.score >= thresholds.poorMinimum) return 'POOR';
  return 'CRITICAL';
}
