import { immutableCopy } from '../domain/immutability.ts';
import type { IssueSeverity } from '../domain/types.ts';
import type {
  DetectiveFinding,
} from '../ai-detective/types.ts';
import type { TruthFinding } from '../product-truth/types.ts';
import type { Recommendation } from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import { percentageOf } from './grade.ts';
import type {
  CatalogPublishingReadiness,
  PublishingReadinessSummary,
} from './types.ts';

const readinessOrder: Readonly<Record<CatalogPublishingReadiness, number>> = {
  UNKNOWN: 0,
  READY: 1,
  READY_WITH_WARNINGS: 2,
  REVIEW_RECOMMENDED: 3,
  REVIEW_REQUIRED: 4,
  BLOCKED: 5,
};

export function mostRestrictiveReadiness(
  values: readonly CatalogPublishingReadiness[],
): CatalogPublishingReadiness {
  return [...values].sort((left, right) => (
    readinessOrder[right] - readinessOrder[left]
  ))[0] ?? 'UNKNOWN';
}

export function publishingReadinessForProduct(input: {
  readonly hasCompleteUpstream: boolean;
  readonly hasEvidence: boolean;
  readonly issueSeverities: readonly IssueSeverity[];
  readonly truthFindings: readonly TruthFinding[];
  readonly detectiveFindings: readonly DetectiveFinding[];
  readonly recommendations: readonly Recommendation[];
  readonly configuration: CatalogHealthConfiguration;
}): CatalogPublishingReadiness {
  if (!input.hasCompleteUpstream || !input.hasEvidence) return 'UNKNOWN';
  if (input.truthFindings.some(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')
    || input.detectiveFindings.some(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')
    || input.recommendations.some(({ blockingStatus }) => blockingStatus === 'BLOCKER')) {
    return 'BLOCKED';
  }
  if (input.truthFindings.some(({ reviewRequirement }) => reviewRequirement === 'REQUIRED')
    || input.detectiveFindings.some(({ reviewRequirement }) => reviewRequirement === 'REQUIRED')
    || input.recommendations.some(({ priority }) => priority <= 2)) {
    return 'REVIEW_REQUIRED';
  }
  if (input.truthFindings.some(({ reviewRequirement }) => reviewRequirement === 'OPTIONAL')
    || input.detectiveFindings.some(({ reviewRequirement }) => reviewRequirement === 'OPTIONAL')
    || input.recommendations.some(({ priority }) => priority === 3)) {
    return 'REVIEW_RECOMMENDED';
  }
  const severityReadiness = input.issueSeverities.map((severity) => {
    if (severity === 'CRITICAL') return input.configuration.readinessMappings.criticalIssue;
    if (severity === 'HIGH') return input.configuration.readinessMappings.highIssue;
    if (severity === 'MEDIUM') return input.configuration.readinessMappings.mediumIssue;
    return input.configuration.readinessMappings.lowIssue;
  });
  if (severityReadiness.length > 0) return mostRestrictiveReadiness(severityReadiness);
  return input.recommendations.length > 0 ? 'READY_WITH_WARNINGS' : 'READY';
}

export function aggregatePublishingReadiness(
  states: readonly CatalogPublishingReadiness[],
): PublishingReadinessSummary {
  const values: readonly CatalogPublishingReadiness[] = [
    'READY',
    'READY_WITH_WARNINGS',
    'REVIEW_RECOMMENDED',
    'REVIEW_REQUIRED',
    'BLOCKED',
    'UNKNOWN',
  ];
  const counts = Object.fromEntries(values.map((value) => [
    value,
    states.filter((state) => state === value).length,
  ])) as Record<CatalogPublishingReadiness, number>;
  const percentages = Object.fromEntries(values.map((value) => [
    value,
    percentageOf(counts[value], states.length),
  ])) as Record<CatalogPublishingReadiness, number>;
  const publishReadyCount = counts.READY + counts.READY_WITH_WARNINGS;
  return immutableCopy({
    counts,
    percentages,
    publishReadyCount,
    publishReadyPercentage: percentageOf(publishReadyCount, states.length),
    blockedPercentage: percentageOf(counts.BLOCKED, states.length),
    unknownCount: counts.UNKNOWN,
  }) as PublishingReadinessSummary;
}
