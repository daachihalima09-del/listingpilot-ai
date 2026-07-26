import type {
  CoordinatorOverallStatus,
  CoordinatorStepStatus,
  NormalizedStepResult,
} from './coordinator-types.ts';

const progress = new Set<CoordinatorStepStatus>(['SUCCEEDED', 'UNCHANGED']);
const trouble = new Set<CoordinatorStepStatus>([
  'PARTIAL', 'FAILED', 'BLOCKED',
]);

export function aggregateCoordinatorStatus(
  steps: Pick<NormalizedStepResult, 'status' | 'applicable'>[],
): CoordinatorOverallStatus {
  const applicable = steps.filter((step) => step.applicable);
  const hasProgress = applicable.some((step) => progress.has(step.status));
  if (applicable.some((step) => trouble.has(step.status))) {
    return hasProgress ? 'PARTIAL' : 'FAILED';
  }
  if (applicable.some((step) => step.status === 'PENDING')) return 'PENDING';
  if (applicable.some((step) => (
    step.status === 'RUNNING' || step.status === 'NOT_STARTED'
  ))) return 'RUNNING';
  if (
    applicable.length
    && applicable.every((step) => (
      step.status === 'UNCHANGED' || step.status === 'SKIPPED'
    ))
  ) return 'UNCHANGED';
  return 'COMPLETED';
}

export function safeOverallMessage(status: CoordinatorOverallStatus) {
  switch (status) {
    case 'COMPLETED': return 'All applicable Shopify publishing steps completed.';
    case 'UNCHANGED': return 'No Shopify changes were required.';
    case 'PARTIAL': return 'Useful progress was saved; some steps need attention.';
    case 'PENDING': return 'Shopify is still processing part of this publication.';
    case 'FAILED': return 'Shopify publication could not make useful progress.';
    case 'RUNNING': return 'Publishing to Shopify is in progress.';
    default: return 'Shopify publication is ready.';
  }
}

export function sanitizeStepSummary(
  value: NormalizedStepResult,
): NormalizedStepResult {
  return {
    step: value.step,
    status: value.status,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    attemptNumber: value.attemptNumber,
    counts: {
      created: value.counts.created,
      updated: value.counts.updated,
      unchanged: value.counts.unchanged,
      pending: value.counts.pending,
      failed: value.counts.failed,
    },
    safeMessage: value.safeMessage?.slice(0, 500) ?? null,
    safeErrorCategory: value.safeErrorCategory?.slice(0, 100) ?? null,
    retryable: value.retryable,
    blocking: value.blocking,
    applicable: value.applicable,
    freshnessKey: value.freshnessKey?.slice(0, 200) ?? null,
  };
}
