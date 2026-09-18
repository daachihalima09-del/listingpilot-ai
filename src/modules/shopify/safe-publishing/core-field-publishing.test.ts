import assert from 'node:assert/strict';
import test from 'node:test';
import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { EffectiveMerchantPreferences } from '../../merchant-preferences/effective-preferences.ts';
import { detailedProductFixture } from '../catalog/snapshot.test.ts';
import { normalizeShopifyProductSnapshot } from '../catalog/snapshot.ts';
import type { PublishingPlanChange } from './publishing-plan.ts';
import {
  catalogValueIsApproved,
  creationCoreChanges,
  creationVerificationFailures,
  enforceCoreUpdatePolicies,
  resolveCatalogCoreValue,
  selectedCoreProductPayload,
} from './core-field-publishing.ts';

function preferences(vendors: string[], productTypes: string[], handle: 'preserve' | 'create' | 'update' = 'preserve'): EffectiveMerchantPreferences {
  return {
    catalog: { vendors, productTypes },
    publishing: { policies: {
      seo: { title: 'PUBLISH_AFTER_APPROVAL', description: 'PUBLISH_AFTER_APPROVAL', handle: handle === 'preserve' ? 'PRESERVE_EXISTING' : 'PUBLISH_AFTER_APPROVAL' },
      handle: { policy: handle === 'create' ? 'GENERATE_FOR_NEW_PRODUCTS_ONLY' : handle === 'update' ? 'UPDATE_AFTER_APPROVAL' : 'PRESERVE_EXISTING', redirectPolicy: 'CREATE_REDIRECT_WHEN_SUPPORTED' },
    } },
  } as unknown as EffectiveMerchantPreferences;
}

function draft(productId: string, vendor = '', productType = ''): ListingDraft {
  const field = (value: string, factIds: string[] = []) => ({ value, factIds });
  return {
    draftId: `draft-${productId}`, schemaVersion: 1, draftVersion: '1.0.0', projectId: productId, workspaceId: 'workspace', sourceInstructionFingerprint: 'instructions', providerRequestId: null, status: 'SAVED',
    title: field('Dyson Supersonic Hair Dryer'), overview: field('Description'), specifications: [], features: [], whatsIncluded: [],
    seo: { title: field('Dyson Supersonic Hair Dryer'), description: field('Shop the reviewed Dyson Supersonic Hair Dryer.'), handle: field('dyson-supersonic-hair-dryer') },
    catalog: { tags: [field('Hair care')], collections: [], vendor: field(vendor), productType: field(productType) }, metafields: [], media: [], reviewNotes: [], confidence: { overall: 100, summary: 'Verified', fieldNotes: [] }, warnings: [], productTruthSummary: [], aiDetectiveSummary: [],
    reviewWorkspace: { lockedFields: [], reviewedSections: ['TITLE', 'OVERVIEW', 'SPECIFICATIONS', 'FEATURES', 'SEO', 'CATALOG'], editedFields: [], traceability: [], facts: [
      { factId: `${productId}-brand`, fieldId: 'brand', label: 'Brand', value: productId === 'product-a' ? 'Dyson' : 'Acme', source: 'Official', confidence: 100, status: 'VERIFIED', truthStatus: 'VERIFIED', allowedUses: ['IDENTITY'] },
      { factId: `${productId}-type`, fieldId: 'product_type', label: 'Product Type', value: productId === 'product-a' ? 'Hair Dryer' : 'Vacuum', source: 'Official', confidence: 100, status: 'VERIFIED', truthStatus: 'VERIFIED', allowedUses: ['IDENTITY'] },
    ], comparison: null, advanced: { localization: [], publishingConstraints: [], aiPolicySummary: [] }, policy: { titleMaximum: 255, seoTitleMaximum: 70, seoDescriptionMaximum: 320, prohibitedTerms: [], lockedHandle: null } },
    createdAt: '2026-08-17T00:00:00.000Z', updatedAt: '2026-08-17T00:00:00.000Z', metadata: { generationStatus: 'READY', selectedFactCount: 2, merchantEdited: false },
  };
}

const change = (fieldId: string, proposedValue: unknown): PublishingPlanChange => ({
  fieldId, displayName: fieldId, group: fieldId.includes('seo') || fieldId.endsWith('handle') ? 'SEO' : 'PRODUCT_CONTENT', currentValue: null, proposedValue,
  operation: 'CREATE', source: 'Reviewed Listing Draft', policy: 'Publishing Profile', risk: fieldId.endsWith('handle') ? 'HIGH' : 'LOW', approvalRequired: true, selected: true, blockedReason: null, resourceId: null,
});

test('verified Product-scoped Brand and Product Type resolve without Project fallback', () => {
  const productA = draft('product-a');
  const productB = draft('product-b');
  assert.equal(resolveCatalogCoreValue(productA, 'vendor'), 'Dyson');
  assert.equal(resolveCatalogCoreValue(productA, 'productType'), 'Hair Dryer');
  assert.equal(resolveCatalogCoreValue(productB, 'vendor'), 'Acme');
  assert.equal(resolveCatalogCoreValue(productB, 'productType'), 'Vacuum');
  assert.equal(catalogValueIsApproved('Dyson', ['dyson']), true);
  assert.equal(catalogValueIsApproved('Dyson', ['Acme']), false);
});

test('approved catalog values and reviewed SEO are selectable while unapproved values stay blocked', () => {
  const approved = creationCoreChanges(draft('product-a'), preferences(['Dyson'], ['Hair Dryer'], 'create'));
  for (const fieldId of ['product.vendor', 'product.productType', 'product.seo.title', 'product.seo.description', 'product.handle']) {
    const field = approved.find((change) => change.fieldId === fieldId)!;
    assert.equal(field.blockedReason, null);
    assert.equal(field.selected, true);
  }
  const unapproved = creationCoreChanges(draft('product-a'), preferences(['Other'], ['Vacuum']));
  assert.match(unapproved.find(({ fieldId }) => fieldId === 'product.vendor')?.blockedReason ?? '', /Catalog Profile/u);
  assert.match(unapproved.find(({ fieldId }) => fieldId === 'product.productType')?.blockedReason ?? '', /Catalog Profile/u);
  assert.match(unapproved.find(({ fieldId }) => fieldId === 'product.handle')?.blockedReason ?? '', /Publishing Profile/u);
});

test('UPDATE_EXISTING permits approved selected core fields and preserves policy-blocked SEO or handle', () => {
  const changes = [
    { ...change('product.vendor', 'Dyson'), currentValue: 'Existing vendor', operation: 'UPDATE' as const },
    { ...change('product.productType', 'Hair Dryer'), currentValue: 'Existing type', operation: 'UPDATE' as const },
    { ...change('product.seo.title', 'Reviewed SEO'), currentValue: 'Existing SEO', operation: 'UPDATE' as const },
    { ...change('product.handle', 'reviewed-handle'), currentValue: 'existing-handle', operation: 'UPDATE' as const },
  ];
  const allowed = enforceCoreUpdatePolicies(changes, preferences(['Dyson'], ['Hair Dryer'], 'update'));
  assert.ok(allowed.every(({ blockedReason }) => blockedReason === null));
  const baseBlocked = preferences(['Other'], ['Vacuum']);
  const blockedPreferences = {
    ...baseBlocked,
    publishing: { ...baseBlocked.publishing, policies: { ...baseBlocked.publishing.policies, seo: { ...baseBlocked.publishing.policies.seo, title: 'PRESERVE_EXISTING' as const } } },
  } as EffectiveMerchantPreferences;
  const blocked = enforceCoreUpdatePolicies(changes, blockedPreferences);
  assert.ok(blocked.every(({ operation }) => operation === 'BLOCKED'));
});

test('saved Product organization wins and ambiguous verified facts fail closed', () => {
  assert.equal(resolveCatalogCoreValue(draft('product-a', 'Merchant Vendor', 'Hair Tools'), 'vendor'), 'Merchant Vendor');
  const base = draft('product-a');
  const ambiguous: ListingDraft = {
    ...base,
    reviewWorkspace: {
      ...base.reviewWorkspace!,
      facts: [...base.reviewWorkspace!.facts, { ...base.reviewWorkspace!.facts[0]!, factId: 'other-brand', value: 'Other' }],
    },
  };
  assert.equal(resolveCatalogCoreValue(ambiguous, 'vendor'), '');
});

test('CREATE_NEW payload contains only selected supported core and SEO fields', () => {
  const selected = [
    change('product.title', 'Dyson Supersonic Hair Dryer'),
    change('product.vendor', 'Dyson'),
    change('product.productType', 'Hair Dryer'),
    change('product.seo.title', 'Dyson Supersonic Hair Dryer'),
    change('product.seo.description', 'Reviewed SEO description'),
    change('product.handle', 'dyson-supersonic-hair-dryer'),
  ];
  assert.deepEqual(selectedCoreProductPayload(selected), {
    title: 'Dyson Supersonic Hair Dryer', vendor: 'Dyson', productType: 'Hair Dryer', handle: 'dyson-supersonic-hair-dryer',
    seo: { title: 'Dyson Supersonic Hair Dryer', description: 'Reviewed SEO description' },
  });
  assert.equal('tags' in selectedCoreProductPayload(selected), false);
});

test('post-create verification covers SEO, handle and catalog values exactly', () => {
  const snapshot = normalizeShopifyProductSnapshot({
    ...detailedProductFixture,
    title: 'Dyson Supersonic Hair Dryer', handle: 'dyson-supersonic-hair-dryer', vendor: 'Dyson', productType: 'Hair Dryer',
    seo: { title: 'Dyson Supersonic Hair Dryer', description: 'Reviewed SEO description' }, status: 'DRAFT',
  }, '2026-07');
  const selected = [
    change('product.title', snapshot.product.title), change('product.vendor', 'Dyson'), change('product.productType', 'Hair Dryer'),
    change('product.seo.title', 'Dyson Supersonic Hair Dryer'), change('product.seo.description', 'Reviewed SEO description'), change('product.handle', 'dyson-supersonic-hair-dryer'),
  ];
  assert.deepEqual(creationVerificationFailures(snapshot, selected), []);
  assert.deepEqual(creationVerificationFailures(snapshot, [change('product.vendor', 'Other')]), ['product.vendor']);
});
