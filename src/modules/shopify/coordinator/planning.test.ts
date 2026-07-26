import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCoordinatorApplicability } from './applicability.ts';
import { buildCoordinatorRetryPlan } from './retry-planner.ts';

const freshness = {
  PRODUCT: 'p1', VARIANTS: 'v1', METAFIELDS: 'm1', IMAGES: 'i1',
};

test('applicability is derived from authoritative configuration state', () => {
  const result = resolveCoordinatorApplicability({
    productReady: true,
    hasVariantConfiguration: false,
    hasEnabledMappedMetafields: false,
    hasActiveImages: false,
    freshness,
  });
  assert.equal(result[0].applicable, true);
  assert.deepEqual(result.slice(1).map(({ applicable }) => applicable), [
    false, false, false,
  ]);
});

test('retry planner keeps success, refreshes pending and retries failures only', () => {
  const current = resolveCoordinatorApplicability({
    productReady: true,
    hasVariantConfiguration: true,
    hasEnabledMappedMetafields: true,
    hasActiveImages: true,
    freshness,
  });
  assert.deepEqual(buildCoordinatorRetryPlan([
    { step: 'PRODUCT', status: 'SUCCEEDED', retryable: false, freshnessKey: 'p1' },
    { step: 'VARIANTS', status: 'FAILED', retryable: true, freshnessKey: 'v1' },
    { step: 'METAFIELDS', status: 'FAILED', retryable: false, freshnessKey: 'm1' },
    { step: 'IMAGES', status: 'PENDING', retryable: true, freshnessKey: 'i1' },
  ], current).map(({ action }) => action), [
    'KEEP_SUCCEEDED', 'RETRY', 'BLOCKED', 'REFRESH',
  ]);
});

test('product/configuration changes reopen completed dependent work', () => {
  const current = resolveCoordinatorApplicability({
    productReady: true,
    hasVariantConfiguration: true,
    hasEnabledMappedMetafields: false,
    hasActiveImages: true,
    freshness: { ...freshness, PRODUCT: 'p2' },
  });
  assert.deepEqual(buildCoordinatorRetryPlan([
    { step: 'PRODUCT', status: 'SUCCEEDED', retryable: false, freshnessKey: 'p1' },
    { step: 'VARIANTS', status: 'SUCCEEDED', retryable: false, freshnessKey: 'v1' },
    { step: 'METAFIELDS', status: 'SKIPPED', retryable: false, freshnessKey: 'm1' },
    { step: 'IMAGES', status: 'SUCCEEDED', retryable: false, freshnessKey: 'i1' },
  ], current).map(({ action }) => action), [
    'REASSESS', 'REASSESS', 'SKIP', 'REASSESS',
  ]);
});
