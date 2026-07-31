import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeMoney,
  normalizeTags,
  remoteFingerprint,
} from './review-normalization.ts';
import { normalizeShopifyProductSnapshot } from '../catalog/snapshot.ts';
import { detailedProductFixture } from '../catalog/snapshot.test.ts';

test('normalizes tags as sets and money without floating-point arithmetic', () => {
  assert.deepEqual(normalizeTags(['Blue', ' blue ', 'RED']), ['blue', 'RED']);
  assert.equal(normalizeMoney('001.2300'), '1.23');
  assert.equal(normalizeMoney('0.00'), '0');
  assert.equal(normalizeMoney(null), null);
});

test('remote fingerprint covers variants, supported metafields, and stable media IDs', () => {
  const first = normalizeShopifyProductSnapshot(detailedProductFixture, '2026-07');
  const second = structuredClone(first);
  assert.equal(remoteFingerprint(first), remoteFingerprint(second));
  second.product.variants[0].price = '11.00';
  assert.notEqual(remoteFingerprint(first), remoteFingerprint(second));
});
