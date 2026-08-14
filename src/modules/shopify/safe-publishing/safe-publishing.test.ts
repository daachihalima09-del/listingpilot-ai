import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { EffectiveMerchantPreferences } from '../../merchant-preferences/effective-preferences.ts';
import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import { assessDuplicateProducts, identityFromDraft } from './duplicate-assessment.ts';
import { changesFromReview, eligibilityBlockers, finalizePlan, publishingDraftFingerprint, validatePlanSelection, type ShopifyPublishingPlanPayload } from './publishing-plan.ts';
import type { ShopifyChangeReviewPayload } from '../review/review-types.ts';

const reviewedSections = ['TITLE', 'OVERVIEW', 'SPECIFICATIONS', 'FEATURES', 'SEO', 'CATALOG'] as const;
function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  const text = (value: string) => ({ value, factIds: ['fact-model'] });
  return {
    draftId: 'draft-1', schemaVersion: 1, draftVersion: '1.0.0', projectId: '10000000-0000-4000-8000-000000000001', workspaceId: '20000000-0000-4000-8000-000000000001', sourceInstructionFingerprint: 'instructions', providerRequestId: null, status: 'SAVED',
    title: text('Samsung Q80D Television'), overview: text('Verified description'), specifications: [], features: [], whatsIncluded: [],
    seo: { title: text('Samsung Q80D'), description: text('Description'), handle: text('samsung-q80d') },
    catalog: { tags: [text('Television')], collections: [text('TVs')], productType: text('Television'), vendor: text('Merchant Store') },
    metafields: [], media: [], reviewNotes: [], confidence: { overall: 90, summary: 'Verified', fieldNotes: [] }, warnings: [], productTruthSummary: [], aiDetectiveSummary: [],
    reviewWorkspace: { lockedFields: [], reviewedSections: [...reviewedSections], editedFields: [], traceability: [], facts: [{ factId: 'fact-model', label: 'Model number', value: 'Q80D', source: 'Official', confidence: 100, status: 'VERIFIED', truthStatus: 'VERIFIED', allowedUses: ['IDENTITY'] }], comparison: null, advanced: { localization: [], publishingConstraints: [], aiPolicySummary: [] }, policy: { titleMaximum: 255, seoTitleMaximum: 70, seoDescriptionMaximum: 320, prohibitedTerms: [], lockedHandle: null }, craft: { packId: 'neovix', packVersion: '1', displayName: 'NEOVIX', status: 'PASS', findings: [], explanations: [], rules: {} } },
    createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T01:00:00.000Z', metadata: { generationStatus: 'READY', selectedFactCount: 1, merchantEdited: false },
    ...overrides,
  } as ListingDraft;
}

const preferences = { publishing: { complete: true }, catalog: { complete: true } } as EffectiveMerchantPreferences;

test('eligibility requires owner, saved and reviewed draft, connected Shopify, complete profile, resolved truth and accepted Craft', () => {
  assert.deepEqual(eligibilityBlockers({ role: 'OWNER', draft: draft(), projectVersion: 1, connected: true, preferences }), []);
  assert.match(eligibilityBlockers({ role: 'MEMBER', draft: draft(), projectVersion: 1, connected: true, preferences })[0]!, /owner/iu);
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: draft({ status: 'EDITED' }), projectVersion: 1, connected: true, preferences }).some((value) => /Save/iu.test(value)));
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: draft({ reviewWorkspace: { ...draft().reviewWorkspace!, reviewedSections: [] } }), projectVersion: 1, connected: true, preferences }).some((value) => /Review/iu.test(value)));
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: draft(), projectVersion: 1, connected: false, preferences }).some((value) => /Connect/iu.test(value)));
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: draft(), projectVersion: 1, connected: true, preferences: { ...preferences, publishing: { ...preferences.publishing, complete: false } } }).some((value) => /Publishing Profile/iu.test(value)));
  const base = draft();
  const rejected = draft({ reviewWorkspace: { ...base.reviewWorkspace!, craft: { ...base.reviewWorkspace!.craft!, status: 'REJECTED' } } });
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: rejected, projectVersion: 1, connected: true, preferences }).some((value) => /Craft/iu.test(value)));
  const conflict = draft({ reviewWorkspace: { ...base.reviewWorkspace!, facts: [{ ...base.reviewWorkspace!.facts[0]!, truthStatus: 'CRITICAL_CONFLICT' }] } });
  assert.ok(eligibilityBlockers({ role: 'OWNER', draft: conflict, projectVersion: 1, connected: true, preferences }).some((value) => /Product Truth/iu.test(value)));
});

test('draft fingerprints are deterministic and change with saved content', () => {
  assert.equal(publishingDraftFingerprint(draft()), publishingDraftFingerprint(draft()));
  assert.notEqual(publishingDraftFingerprint(draft()), publishingDraftFingerprint(draft({ title: { value: 'Changed', factIds: ['fact-model'] } })));
});

test('duplicate assessment blocks exact, strong and insufficient identities and exposes possible matches', () => {
  const identity = { ...identityFromDraft(draft()), barcode: '123', sku: 'SKU-1' };
  assert.equal(assessDuplicateProducts(identity, [{ productGid: 'gid://shopify/Product/1', title: 'Other', handle: 'other', vendor: '', productType: '', barcode: '123' }]).result, 'EXACT_MATCH');
  assert.equal(assessDuplicateProducts({ ...identity, barcode: null, sku: null }, [{ productGid: 'gid://shopify/Product/1', title: 'Q80D Television', handle: 'q80d', vendor: 'Merchant Store', productType: 'Television' }]).result, 'STRONG_MATCH');
  assert.equal(assessDuplicateProducts({ ...identity, barcode: null, sku: null, modelNumber: null }, []).result, 'INSUFFICIENT_IDENTITY');
  const possibleIdentity = { ...identity, title: 'Premium Television', modelNumber: 'Q80D' };
  assert.equal(assessDuplicateProducts(possibleIdentity, [{ productGid: 'gid://shopify/Product/1', title: possibleIdentity.title, handle: 'same-title', vendor: 'Other', productType: 'Other' }]).result, 'POSSIBLE_MATCH');
  assert.equal(assessDuplicateProducts(identity, []).result, 'NO_MATCH');
});

const review: ShopifyChangeReviewPayload = {
  schemaVersion: '1', projectId: 'p', workspaceId: 'w', shopifyStoreId: 's', shopifyProductGid: 'gid://shopify/Product/1', baselineShopifyUpdatedAt: '2026-08-08T00:00:00.000Z', remoteShopifyUpdatedAt: '2026-08-08T00:00:00.000Z', generatedAt: '2026-08-08T00:00:00.000Z', summary: { totalChanges: 2, localChanges: 2, remoteChanges: 0, conflicts: 0, blocked: 0 }, blockers: [], warnings: [],
  fields: [
    { fieldPath: 'product.tags', label: 'Tags', resourceType: 'PRODUCT', resourceId: 'gid://shopify/Product/1', classification: 'LOCAL_CHANGED', baselineValue: ['Existing'], localValue: ['Approved'], remoteValue: ['Existing'], publishable: true, defaultDecision: 'USE_LISTINGPILOT', availableDecisions: ['USE_LISTINGPILOT', 'KEEP_SHOPIFY', 'SKIP'], warningCodes: [], blockerCodes: [] },
    { fieldPath: 'variants.gid://shopify/ProductVariant/2.price', label: 'Price', resourceType: 'VARIANT', resourceId: 'gid://shopify/ProductVariant/2', classification: 'LOCAL_CHANGED', baselineValue: '10', localValue: '11', remoteValue: '10', publishable: true, defaultDecision: 'USE_LISTINGPILOT', availableDecisions: ['USE_LISTINGPILOT', 'KEEP_SHOPIFY', 'SKIP'], warningCodes: ['VARIANT_PRICE'], blockerCodes: [] },
  ],
};

function plan(): ShopifyPublishingPlanPayload {
  const changes = changesFromReview(review);
  return finalizePlan({ schemaVersion: 1, planVersion: 1, workspaceId: 'w', projectId: 'p', shopifyStoreId: 's', mode: 'UPDATE_EXISTING', productIdentity: { title: 'Product', modelNumber: 'M1', sku: null, barcode: null }, listingPreview: null, shopifyLinkage: { verified: true, productGid: 'gid://shopify/Product/1' }, draftFingerprint: 'a'.repeat(64), projectVersion: 1, remoteFingerprint: 'b'.repeat(64), remoteUpdatedAt: '2026-08-08T00:00:00.000Z', publishingProfileFingerprint: 'c'.repeat(64), changes, blockers: [], warnings: [], highImpactOperations: [changes[1]!.fieldId], duplicateAssessment: { result: 'NO_MATCH', candidates: [], reviewed: false }, confirmationRequirements: [changes[1]!.fieldId], inventoryProtected: true, collectionsCreated: false, createdAt: '2026-08-08T00:00:00.000Z', expiresAt: '2026-08-08T00:30:00.000Z' });
}

test('plans preserve tags by append and require high-impact server confirmation', () => {
  const value = plan();
  assert.deepEqual(value.changes[0]!.proposedValue, ['Existing', 'Approved']);
  assert.equal(value.changes[0]!.operation, 'APPEND');
  const request = { planId: '10000000-0000-4000-8000-000000000001', planVersion: 1, planFingerprint: value.planFingerprint, selectedFieldIds: [value.changes[1]!.fieldId], confirmations: [], duplicateCandidateReviewed: false };
  assert.throws(() => validatePlanSelection(value, request), /HIGH_IMPACT/);
  assert.doesNotThrow(() => validatePlanSelection(value, { ...request, confirmations: [value.changes[1]!.fieldId] }));
});

test('safe publishing source has no inventory or collection mutations and no create fallback in update review', () => {
  const service = readFileSync(new URL('./safe-publishing-service.server.ts', import.meta.url), 'utf8');
  const reviewService = readFileSync(new URL('../review/review-service.server.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../components/SafeShopifyPublishingClient.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(service, /inventoryAdjust|inventorySet|collectionCreate|collectionDelete|collectionUpdate/iu);
  assert.doesNotMatch(reviewService, /productCreate|productVariantsBulkCreate/iu);
  assert.match(service, /status: 'DRAFT'/u);
  assert.match(client, /Inventory is managed separately and will not be changed/u);
  assert.match(client, /role="dialog"/u);
  assert.doesNotMatch(client, /window\.confirm/u);
  assert.match(client, /Choose a Shopify destination/u);
  assert.match(client, /Create New Product/u);
  assert.match(client, /Link Existing Product/u);
  assert.match(client, /it does not change Shopify/u);
});
