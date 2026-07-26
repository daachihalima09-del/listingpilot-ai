import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCoordinatorStatus, sanitizeStepSummary } from './aggregation.ts';
import {
  emptyCounts,
  SHOPIFY_PUBLICATION_STEPS,
  SHOPIFY_PUBLICATION_STEP_STATUSES,
  type CoordinatorStepStatus,
  type NormalizedStepResult,
} from './coordinator-types.ts';

const steps = (...statuses: CoordinatorStepStatus[]) => statuses.map((status) => ({
  status,
  applicable: status !== 'SKIPPED',
}));

test('shared identifiers and statuses are stable', () => {
  assert.deepEqual(SHOPIFY_PUBLICATION_STEPS, [
    'PRODUCT', 'VARIANTS', 'METAFIELDS', 'IMAGES',
  ]);
  assert.equal(SHOPIFY_PUBLICATION_STEP_STATUSES.includes('BLOCKED'), true);
});

test('aggregation distinguishes completed, unchanged, pending, partial and failed', () => {
  assert.equal(aggregateCoordinatorStatus(steps('SUCCEEDED', 'SKIPPED')), 'COMPLETED');
  assert.equal(aggregateCoordinatorStatus(steps('UNCHANGED', 'SKIPPED')), 'UNCHANGED');
  assert.equal(aggregateCoordinatorStatus(steps('SUCCEEDED', 'FAILED')), 'PARTIAL');
  assert.equal(aggregateCoordinatorStatus(steps('SUCCEEDED', 'BLOCKED')), 'PARTIAL');
  assert.equal(aggregateCoordinatorStatus(steps('SUCCEEDED', 'PENDING')), 'PENDING');
  assert.equal(aggregateCoordinatorStatus(steps('FAILED', 'BLOCKED')), 'FAILED');
});

test('safe serialization excludes unapproved secret and payload fields', () => {
  const input: NormalizedStepResult & Record<string, unknown> = {
    step: 'PRODUCT', status: 'SUCCEEDED', startedAt: null, completedAt: null,
    attemptNumber: 1, counts: emptyCounts(), safeMessage: 'ok',
    safeErrorCategory: null, retryable: false, blocking: false,
    applicable: true, freshnessKey: 'v1', accessToken: 'secret',
    graphql: 'mutation',
  };
  const result = sanitizeStepSummary(input) as unknown as Record<string, unknown>;
  assert.equal('accessToken' in result, false);
  assert.equal('graphql' in result, false);
});
