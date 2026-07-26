import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeImageResult,
  normalizeMetafieldResult,
  normalizeProductResult,
  normalizeVariantResult,
} from './step-adapters.ts';

test('product outcomes normalize linkage and no-change safely', () => {
  assert.equal(normalizeProductResult({
    outcome: 'CREATED', changedFields: [],
  }, 1, 'p').status, 'SUCCEEDED');
  assert.equal(normalizeProductResult({
    outcome: 'UNCHANGED', changedFields: [],
  }, 1, 'p').status, 'UNCHANGED');
  const unsafe = normalizeProductResult({
    outcome: 'LINK_PENDING', changedFields: [],
  }, 1, 'p');
  assert.equal(unsafe.blocking, true);
  assert.equal(unsafe.status, 'FAILED');
});

test('variant/metafield partial results are retryable and non-blocking', () => {
  const variant = normalizeVariantResult({
    outcome: 'PARTIAL', created: 1, updated: 0, unchanged: 1,
  }, 1, 'v');
  const metafield = normalizeMetafieldResult({
    outcome: 'PARTIAL', created: 1, updated: 0, unchanged: 2, conflicted: 1,
  }, 1, 'm');
  assert.equal(variant.retryable && metafield.retryable, true);
  assert.equal(variant.blocking || metafield.blocking, false);
});

test('image success, unchanged, pending and partial normalize distinctly', () => {
  for (const outcome of ['PUBLISHED', 'UNCHANGED', 'PENDING', 'PARTIAL'] as const) {
    const result = normalizeImageResult({
      outcome, created: 0, updated: 0, unchanged: 1,
      pending: outcome === 'PENDING' ? 1 : 0,
      failed: outcome === 'PARTIAL' ? 1 : 0,
      message: 'Safe',
    }, 1, 'i');
    assert.equal(result.status, outcome === 'PUBLISHED' ? 'SUCCEEDED' : outcome);
  }
});
