import type {
  CoordinatorProjectContext,
} from './coordinator-repository.ts';
import {
  emptyCounts,
  type CoordinatorStep,
  type NormalizedStepResult,
} from './coordinator-types.ts';

export interface CoordinatorStepAdapter {
  readonly step: CoordinatorStep;
  execute(
    context: CoordinatorProjectContext,
    attemptNumber: number,
    freshnessKey: string,
  ): Promise<NormalizedStepResult>;
  refreshPending?(
    context: CoordinatorProjectContext,
    attemptNumber: number,
    freshnessKey: string,
  ): Promise<NormalizedStepResult>;
}

function base(
  step: CoordinatorStep,
  attemptNumber: number,
  freshnessKey: string,
) {
  return {
    step,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    attemptNumber,
    safeErrorCategory: null,
    retryable: false,
    blocking: false,
    applicable: true,
    freshnessKey,
  };
}

export function normalizeProductResult(
  result: {
    outcome: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'LINK_PENDING' | 'RECOVERED';
    changedFields: string[];
  },
  attemptNumber: number,
  freshnessKey: string,
): NormalizedStepResult {
  const unchanged = result.outcome === 'UNCHANGED';
  const pending = result.outcome === 'LINK_PENDING';
  return {
    ...base('PRODUCT', attemptNumber, freshnessKey),
    status: pending ? 'FAILED' : unchanged ? 'UNCHANGED' : 'SUCCEEDED',
    counts: {
      ...emptyCounts(),
      created: result.outcome === 'CREATED' ? 1 : 0,
      updated: ['UPDATED', 'RECOVERED'].includes(result.outcome) ? 1 : 0,
      unchanged: unchanged ? 1 : 0,
      failed: pending ? 1 : 0,
    },
    safeMessage: pending
      ? 'The Shopify product link could not be persisted safely.'
      : unchanged
        ? 'No product changes were required.'
        : 'The Shopify product and project linkage are ready.',
    safeErrorCategory: pending ? 'product_linkage_unresolved' : null,
    retryable: pending,
    blocking: pending,
  };
}

export function normalizeVariantResult(
  result: {
    outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL';
    created: number;
    updated: number;
    unchanged: number;
  },
  attemptNumber: number,
  freshnessKey: string,
): NormalizedStepResult {
  return {
    ...base('VARIANTS', attemptNumber, freshnessKey),
    status: result.outcome === 'PUBLISHED'
      ? 'SUCCEEDED'
      : result.outcome === 'UNCHANGED' ? 'UNCHANGED' : 'PARTIAL',
    counts: {
      ...emptyCounts(),
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      failed: result.outcome === 'PARTIAL' ? 1 : 0,
    },
    safeMessage: result.outcome === 'PARTIAL'
      ? 'Some variant work completed and can be resumed.'
      : result.outcome === 'UNCHANGED'
        ? 'No variant changes were required.'
        : 'Variants and pricing were published.',
    retryable: result.outcome === 'PARTIAL',
  };
}

export function normalizeMetafieldResult(
  result: {
    outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL';
    created: number;
    updated: number;
    unchanged: number;
    conflicted: number;
  },
  attemptNumber: number,
  freshnessKey: string,
): NormalizedStepResult {
  return {
    ...base('METAFIELDS', attemptNumber, freshnessKey),
    status: result.outcome === 'PUBLISHED'
      ? 'SUCCEEDED'
      : result.outcome === 'UNCHANGED' ? 'UNCHANGED' : 'PARTIAL',
    counts: {
      ...emptyCounts(),
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      failed: result.conflicted,
    },
    safeMessage: result.outcome === 'PARTIAL'
      ? 'Compatible metafields published; some fields need attention.'
      : result.outcome === 'UNCHANGED'
        ? 'No metafield changes were required.'
        : 'Metafields were published.',
    retryable: result.outcome === 'PARTIAL',
  };
}

export function normalizeImageResult(
  result: {
    outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL' | 'PENDING';
    created: number;
    updated: number;
    unchanged: number;
    pending: number;
    failed: number;
    message: string;
  },
  attemptNumber: number,
  freshnessKey: string,
): NormalizedStepResult {
  return {
    ...base('IMAGES', attemptNumber, freshnessKey),
    status: result.outcome === 'PUBLISHED'
      ? 'SUCCEEDED'
      : result.outcome,
    counts: {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      pending: result.pending,
      failed: result.failed,
    },
    safeMessage: result.message,
    retryable: result.outcome === 'PARTIAL' || result.outcome === 'PENDING',
  };
}

export function failedStep(
  step: CoordinatorStep,
  attemptNumber: number,
  freshnessKey: string,
  blocking: boolean,
  category: string,
): NormalizedStepResult {
  return {
    ...base(step, attemptNumber, freshnessKey),
    status: 'FAILED',
    counts: { ...emptyCounts(), failed: 1 },
    safeMessage: blocking
      ? 'This step could not establish a safe product dependency.'
      : 'This step could not be completed and can be retried safely.',
    safeErrorCategory: category,
    retryable: true,
    blocking,
  };
}
