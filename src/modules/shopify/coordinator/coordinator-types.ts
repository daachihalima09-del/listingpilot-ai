export const SHOPIFY_PUBLICATION_STEPS = [
  'PRODUCT',
  'VARIANTS',
  'METAFIELDS',
  'IMAGES',
] as const;

export const SHOPIFY_PUBLICATION_STEP_STATUSES = [
  'NOT_STARTED',
  'RUNNING',
  'SUCCEEDED',
  'UNCHANGED',
  'SKIPPED',
  'PENDING',
  'PARTIAL',
  'FAILED',
  'BLOCKED',
] as const;

export type CoordinatorStep = typeof SHOPIFY_PUBLICATION_STEPS[number];
export type CoordinatorStepStatus =
  typeof SHOPIFY_PUBLICATION_STEP_STATUSES[number];
export type CoordinatorOverallStatus =
  | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'UNCHANGED'
  | 'PARTIAL' | 'PENDING' | 'FAILED' | 'CANCELLED';
export type CoordinatorTrigger =
  | 'MANUAL_FULL' | 'MANUAL_RETRY' | 'REFRESH_PENDING';

export interface NormalizedStepResult {
  step: CoordinatorStep;
  status: CoordinatorStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  attemptNumber: number;
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    pending: number;
    failed: number;
  };
  safeMessage: string | null;
  safeErrorCategory: string | null;
  retryable: boolean;
  blocking: boolean;
  applicable: boolean;
  freshnessKey: string | null;
}

export interface CoordinatorExecutionDto {
  overallStatus: CoordinatorOverallStatus | 'READY';
  executionStartedAt: string | null;
  executionCompletedAt: string | null;
  canPublish: boolean;
  canRetry: boolean;
  canRefresh: boolean;
  isRunning: boolean;
  hasPendingWork: boolean;
  safeSummary: string;
  steps: Array<NormalizedStepResult & {
    displayName: string;
    progressLabel: string;
  }>;
}

export const STEP_DISPLAY_NAMES: Record<CoordinatorStep, string> = {
  PRODUCT: 'Product',
  VARIANTS: 'Variants & Pricing',
  METAFIELDS: 'Metafields',
  IMAGES: 'Images',
};

export function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0, pending: 0, failed: 0 };
}
