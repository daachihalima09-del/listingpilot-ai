import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewStale } from './review-staleness.ts';

const fresh = {
  status: 'OPEN' as const,
  expiresAt: new Date('2026-07-27T12:30:00.000Z'),
  projectVersion: 2,
  currentProjectVersion: 2,
  shopifyStoreId: 'store-1',
  currentShopifyStoreId: 'store-1',
  shopifyProductGid: 'gid://shopify/Product/1',
  currentShopifyProductGid: 'gid://shopify/Product/1',
  baselineSnapshotHash: 'base',
  currentBaselineSnapshotHash: 'base',
  remoteFingerprint: 'remote',
  currentRemoteFingerprint: 'remote',
  now: new Date('2026-07-27T12:00:00.000Z'),
};

test('detects project, remote, connection, baseline, expiry, and consumed staleness', () => {
  assert.equal(isReviewStale(fresh), false);
  assert.equal(isReviewStale({ ...fresh, currentProjectVersion: 3 }), true);
  assert.equal(isReviewStale({ ...fresh, currentRemoteFingerprint: 'changed' }), true);
  assert.equal(isReviewStale({ ...fresh, currentShopifyStoreId: 'store-2' }), true);
  assert.equal(isReviewStale({ ...fresh, currentBaselineSnapshotHash: 'changed' }), true);
  assert.equal(isReviewStale({ ...fresh, status: 'PUBLISHED' }), true);
  assert.equal(isReviewStale({ ...fresh, now: fresh.expiresAt }), true);
});

