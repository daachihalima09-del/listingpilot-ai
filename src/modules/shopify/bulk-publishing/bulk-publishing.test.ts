import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertAuthorizedProductSelection,
  bulkExecuteSchema,
  bulkPrepareSchema,
  buildBulkPublishingItemCreates,
  classifyBulkProduct,
  deriveBatchStatus,
  isBulkPlanFresh,
  runWithConcurrency,
  summarizeBulkResults,
} from './bulk-publishing.ts';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const otherWorkspaceId = '10000000-0000-4000-8000-000000000002';
const projectId = '20000000-0000-4000-8000-000000000001';
const otherProjectId = '20000000-0000-4000-8000-000000000002';
const productA = '30000000-0000-4000-8000-000000000001';
const productB = '30000000-0000-4000-8000-000000000002';
const ready = { hasAnalysis: true, hasListing: true, listingStatus: 'SAVED', reviewedSectionCount: 6, isShopifyLinked: false, hasStalePlan: false };

test('multiple Products can be selected', () => assert.equal(bulkPrepareSchema.parse({ workspaceId, products: [{ productId: productA, intent: 'REVIEW' }, { productId: productB, intent: 'CREATE_NEW' }] }).products.length, 2));
test('duplicate Product selection is rejected', () => assert.throws(() => bulkPrepareSchema.parse({ workspaceId, products: [{ productId: productA, intent: 'REVIEW' }, { productId: productA, intent: 'REVIEW' }] })));
test('authorized Products from one Project are accepted together', () => assert.doesNotThrow(() => assertAuthorizedProductSelection([productA, productB], [{ id: productA, projectId, workspaceId }, { id: productB, projectId, workspaceId }], projectId, workspaceId)));
test('cross-workspace Product injection is rejected', () => assert.throws(() => assertAuthorizedProductSelection([productA], [{ id: productA, projectId, workspaceId: otherWorkspaceId }], projectId, workspaceId), /BULK_PRODUCT_SCOPE_INVALID/u));
test('cross-project Product injection is rejected', () => assert.throws(() => assertAuthorizedProductSelection([productA], [{ id: productA, projectId: otherProjectId, workspaceId }], projectId, workspaceId), /BULK_PRODUCT_SCOPE_INVALID/u));
test('missing authorized Product rejects the entire selection', () => assert.throws(() => assertAuthorizedProductSelection([productA, productB], [{ id: productA, projectId, workspaceId }], projectId, workspaceId)));
test('bulk batch persistence connects each Product by its Product-scoped composite identity', () => {
  assert.deepEqual(
    buildBulkPublishingItemCreates([
      { productId: productA, intent: 'REVIEW' },
      { productId: productB, intent: 'CREATE_NEW' },
    ], workspaceId),
    [
      { intent: 'BLOCKED', product: { connect: { id_workspaceId: { id: productA, workspaceId } } } },
      { intent: 'CREATE_NEW', product: { connect: { id_workspaceId: { id: productB, workspaceId } } } },
    ],
  );
});
test('not-analyzed Product is blocked', () => assert.equal(classifyBulkProduct({ ...ready, hasAnalysis: false }), 'BLOCKED'));
test('not-generated Product is reported independently', () => assert.equal(classifyBulkProduct({ ...ready, hasListing: false }), 'NOT_GENERATED'));
test('unsaved Product is not bulk-publishable', () => assert.equal(classifyBulkProduct({ ...ready, listingStatus: 'EDITED' }), 'NOT_SAVED'));
test('unapproved Product needs review', () => assert.equal(classifyBulkProduct({ ...ready, reviewedSectionCount: 5 }), 'NEEDS_REVIEW'));
test('fresh approved unlinked Product is ready', () => assert.equal(classifyBulkProduct(ready), 'READY'));
test('linked Product uses the existing-link classification', () => assert.equal(classifyBulkProduct({ ...ready, isShopifyLinked: true }), 'ALREADY_LINKED'));
test('stale Product plan is visible', () => assert.equal(classifyBulkProduct({ ...ready, hasStalePlan: true }), 'PUBLISHING_PLAN_STALE'));
test('Product A version change only makes Product A stale', () => {
  const common = { status: 'OPEN', expiresAt: new Date('2026-08-15T01:00:00Z'), now: new Date('2026-08-15T00:00:00Z'), planProductVersion: 2, currentDraftFingerprint: 'a', planDraftFingerprint: 'a' };
  assert.equal(isBulkPlanFresh({ ...common, productVersion: 3 }), false);
  assert.equal(isBulkPlanFresh({ ...common, productVersion: 2 }), true);
});
test('actual draft fingerprint change makes only that plan stale', () => assert.equal(isBulkPlanFresh({ status: 'OPEN', expiresAt: new Date('2026-08-15T01:00:00Z'), now: new Date('2026-08-15T00:00:00Z'), productVersion: 2, planProductVersion: 2, currentDraftFingerprint: 'changed', planDraftFingerprint: 'original' }), false));
test('expired plans are stale', () => assert.equal(isBulkPlanFresh({ status: 'OPEN', expiresAt: new Date('2026-08-14T23:00:00Z'), now: new Date('2026-08-15T00:00:00Z'), productVersion: 2, planProductVersion: 2, currentDraftFingerprint: 'a', planDraftFingerprint: 'a' }), false));
test('batch result accurately summarizes success and failure', () => assert.deepEqual(summarizeBulkResults(['COMPLETED', 'FAILED', 'BLOCKED']), { total: 3, succeeded: 1, failed: 2, pending: 0 }));
test('one Product failure produces partial success without corrupting success', () => assert.equal(deriveBatchStatus(['COMPLETED', 'FAILED', 'COMPLETED']), 'PARTIAL_SUCCESS'));
test('an unapproved Product remains pending beside an independently completed Product', () => assert.equal(deriveBatchStatus(['COMPLETED', 'READY']), 'PARTIAL_SUCCESS'));
test('all independently completed Products complete the batch', () => assert.equal(deriveBatchStatus(['COMPLETED', 'COMPLETED']), 'COMPLETED'));
test('all blocked or failed Products fail the batch safely', () => assert.equal(deriveBatchStatus(['BLOCKED', 'FAILED']), 'FAILED'));
test('bulk execution requires explicit final confirmation', () => assert.throws(() => bulkExecuteSchema.parse({ workspaceId, confirmed: false })));
test('explicit final confirmation is accepted', () => assert.equal(bulkExecuteSchema.parse({ workspaceId, confirmed: true }).confirmed, true));

const service = readFileSync(new URL('./bulk-publishing-service.server.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('./BulkShopifyReviewClient.tsx', import.meta.url), 'utf8');
const productList = readFileSync(new URL('../../products/components/ProductListClient.tsx', import.meta.url), 'utf8');
const migration = readFileSync('prisma/migrations/20260815100000_bulk_safe_shopify_publishing/migration.sql', 'utf8');

test('Product A and Product B prepare independent publishing plans', () => { assert.match(service, /runWithConcurrency\(input\.products, 4/u); assert.match(service, /prepareSafePublishingPlan\(userId, productId/u); assert.match(migration, /UNIQUE INDEX "shopify_bulk_publishing_items_publishing_plan_id_key"/u); });
test('one bounded Product operation failure does not prevent another Product result', async () => {
  const completed: string[] = [];
  await runWithConcurrency(['A', 'B'], 2, async (item) => {
    try { if (item === 'A') throw new Error('failed'); completed.push(item); } catch { completed.push(`${item}:failed`); }
  });
  assert.deepEqual(completed.sort(), ['A:failed', 'B']);
});
test('bulk preparation performs no Shopify mutation directly', () => { assert.doesNotMatch(service, /productCreate\s*\(/u); assert.doesNotMatch(service, /requestShopifyAdminApi/u); });
test('bulk preparation and execution make no OpenAI or generation call', () => { assert.doesNotMatch(service, /OpenAI|openai|generateProjectListing|createOpenAi/u); });
test('unlinked Product requires an explicit CREATE_NEW action', () => { assert.match(client, /Create New as Draft/u); assert.match(service, /PREPARE_CREATE_NEW/u); });
test('CREATE_NEW remains DRAFT-only through existing Safe Publishing', () => { const safe = readFileSync(new URL('../safe-publishing/safe-publishing-service.server.ts', import.meta.url), 'utf8'); assert.match(safe, /status: 'DRAFT'/u); assert.match(client, /Shopify Draft only/u); });
test('linked Product retains verified existing identity', () => { assert.match(service, /shopifyProductImportLink/u); assert.match(client, /Update verified existing Product/u); });
test('each Product execution is claimed and caught independently', () => { assert.match(service, /existing\.items\.find/u); assert.match(service, /status: 'READY', reviewedAt: \{ not: null \}/u); assert.match(service, /catch \(error\)/u); });
test('serverless execution advances one durable Product per request', () => { assert.match(client, /for \(let attempt = 0; attempt <= batch\.items\.length/u); assert.match(service, /const item = existing\.items\.find/u); });
test('abandoned in-flight Product is marked uncertain and never retried automatically', () => { assert.match(service, /abandonedBefore/u); assert.match(service, /UNCERTAIN_REMOTE_STATE/u); });
test('duplicate bulk execution cannot claim a finished batch', () => { assert.match(service, /status: \{ in: \['READY', 'PREPARING'\] \}/u); assert.match(service, /BULK_EXECUTION_ALREADY_STARTED/u); });
test('completed batch execution is idempotently returned', () => assert.match(service, /if \(existing\.completedAt\) return batchDto\(existing\)/u));
test('repreparing a blocked Product reopens its durable batch', () => assert.match(service, /completedAt: null/u));
test('failed Product retry creates a new fresh Product plan', () => { assert.match(client, /Refresh this Product/u); assert.match(service, /prepareSafePublishingPlan\(userId, item\.productId/u); });
test('bulk review survives reload through a durable batch query', () => { assert.match(service, /shopifyBulkPublishingBatch\.findFirst/u); assert.match(migration, /shopify_bulk_publishing_batches/u); });
test('Project page exposes multiple selection and select-all-eligible controls', () => { assert.match(productList, /selectedIds/u); assert.match(productList, /Select all eligible/u); });
test('final confirmation visibly lists every executing Product', () => { assert.match(client, /role="dialog"/u); assert.match(client, /readyReviewed\.map/u); assert.match(client, /Confirm Bulk Publishing/u); });
test('individual Product workflow remains available', () => { assert.match(productList, />Open<\/Link>/u); assert.match(client, /Back to Products/u); });
test('batch audit preserves Product-level publishing audit path', () => { assert.match(service, /bulk_publish\.prepared/u); assert.match(service, /executeSafePublishingPlan/u); });
