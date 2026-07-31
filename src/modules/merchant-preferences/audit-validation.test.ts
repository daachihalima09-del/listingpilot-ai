import assert from 'node:assert/strict';
import test from 'node:test';
import {
  merchantProfileCreatedAuditEvent,
  preferenceSectionAuditEvent,
} from './audit.ts';
import { MerchantPreferenceError } from './errors.ts';
import { assertMerchantPreferenceStatusTransition } from './validation.ts';

test('builds profile creation, import, creation, completion and update events', () => {
  assert.equal(
    merchantProfileCreatedAuditEvent().action,
    'merchant_profile.created',
  );
  assert.equal(preferenceSectionAuditEvent({
    sectionId: 'catalog',
    source: 'SHOPIFY_IMPORT',
    previousVersion: null,
    newVersion: 1,
    status: 'COMPLETE',
  }).action, 'merchant_profile.catalog_imported');
  assert.equal(preferenceSectionAuditEvent({
    sectionId: 'catalog',
    source: 'MANUAL',
    previousVersion: null,
    newVersion: 1,
    status: 'COMPLETE',
  }).action, 'merchant_profile.section_created');
  assert.equal(preferenceSectionAuditEvent({
    sectionId: 'catalog',
    source: 'MERCHANT_EDIT',
    previousVersion: 1,
    previousStatus: 'IN_PROGRESS',
    newVersion: 2,
    status: 'COMPLETE',
  }).action, 'merchant_profile.section_completed');
  assert.equal(preferenceSectionAuditEvent({
    sectionId: 'catalog',
    source: 'MERCHANT_EDIT',
    previousVersion: 2,
    previousStatus: 'COMPLETE',
    newVersion: 3,
    status: 'COMPLETE',
  }).action, 'merchant_profile.section_updated');
});

test('records review-required events with a bounded safe summary', () => {
  const event = preferenceSectionAuditEvent({
    sectionId: 'catalog',
    source: 'MERCHANT_EDIT',
    previousVersion: 3,
    previousStatus: 'COMPLETE',
    newVersion: 4,
    status: 'NEEDS_REVIEW',
    valueCounts: {
      collections: 2,
      productTypes: 1,
      vendors: 1,
    },
  });
  assert.equal(event.action, 'merchant_profile.section_review_required');
  assert.deepEqual(event.metadata.changedFields, [
    'payload',
    'completion',
    'source',
  ]);
  assert.deepEqual(event.metadata.valueCounts, {
    collections: 2,
    productTypes: 1,
    vendors: 1,
  });
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /descriptionHtml|accessToken|Northwind/);
  assert.ok(serialized.length < 1_000);
});

test('rejects invalid completion-state regressions', () => {
  assert.throws(
    () => assertMerchantPreferenceStatusTransition(
      'COMPLETE',
      'IN_PROGRESS',
    ),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'INVALID_COMPLETION_TRANSITION'
      && error.statusCode === 409
    ),
  );
  assert.doesNotThrow(() => assertMerchantPreferenceStatusTransition(
    'NEEDS_REVIEW',
    'COMPLETE',
  ));
});

