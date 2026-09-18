import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReviewDecisions } from './review-decisions.ts';
import type { ShopifyChangeReviewPayload } from './review-types.ts';
import { buildSelectiveUpdatePlan } from './selective-update-plan.ts';
import { buildReviewField } from './three-way-comparison.ts';

const field = buildReviewField({
  fieldPath: 'product.title',
  label: 'Title',
  resourceType: 'PRODUCT',
  baselineValue: 'A',
  localValue: 'B',
  remoteValue: 'A',
  publishable: true,
});
const review: ShopifyChangeReviewPayload = {
  schemaVersion: '1',
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  shopifyStoreId: 'store-1',
  shopifyProductGid: 'gid://shopify/Product/1',
  baselineShopifyUpdatedAt: '2026-07-27T00:00:00.000Z',
  remoteShopifyUpdatedAt: '2026-07-27T00:00:00.000Z',
  generatedAt: '2026-07-27T00:00:00.000Z',
  summary: { totalChanges: 1, localChanges: 1, remoteChanges: 0, conflicts: 0, blocked: 0 },
  fields: [field],
  blockers: [],
  warnings: [],
};

test('rejects arbitrary browser field paths and unavailable decisions', () => {
  assert.throws(() => validateReviewDecisions(review, {
    version: 1,
    decisions: { 'product.attacker': 'USE_LISTINGPILOT' },
  }), /INVALID_DECISION/);
});

test('builds an update-only plan containing only approved fields', () => {
  const plan = buildSelectiveUpdatePlan({
    reviewId: 'review-1',
    reviewVersion: 1,
    review,
    decisions: { 'product.title': 'USE_LISTINGPILOT' },
  });
  assert.equal(plan.mode, 'UPDATE');
  assert.deepEqual(plan.productFieldChanges, { 'product.title': 'B' });
  assert.equal('create' in plan, false);
});

test('unresolved conflicts and selected blocked fields reject planning', () => {
  const conflict = { ...review, fields: [{ ...field, classification: 'CONFLICT' as const, defaultDecision: null }] };
  assert.throws(() => buildSelectiveUpdatePlan({
    reviewId: 'r',
    reviewVersion: 1,
    review: conflict,
    decisions: {},
  }), /UNRESOLVED_CONFLICT/);
});

test('unselected SEO and catalog fields remain untouched', () => {
  const seoTitle = buildReviewField({ fieldPath: 'product.seo.title', label: 'SEO title', resourceType: 'PRODUCT', baselineValue: 'Existing SEO', localValue: 'Reviewed SEO', remoteValue: 'Existing SEO', publishable: true });
  const vendor = buildReviewField({ fieldPath: 'product.vendor', label: 'Vendor', resourceType: 'PRODUCT', baselineValue: 'Existing vendor', localValue: 'Approved vendor', remoteValue: 'Existing vendor', publishable: true });
  const extended = { ...review, fields: [field, seoTitle, vendor] };
  const plan = buildSelectiveUpdatePlan({
    reviewId: 'review-2', reviewVersion: 1, review: extended,
    decisions: { 'product.title': 'USE_LISTINGPILOT', 'product.seo.title': 'KEEP_SHOPIFY', 'product.vendor': 'SKIP' },
  });
  assert.deepEqual(plan.productFieldChanges, { 'product.title': 'B' });
  assert.ok(plan.skippedFields.includes('product.seo.title'));
  assert.ok(plan.skippedFields.includes('product.vendor'));
});
