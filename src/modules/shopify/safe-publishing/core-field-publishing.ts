import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { EffectiveMerchantPreferences } from '../../merchant-preferences/effective-preferences.ts';
import type { ShopifyProductSnapshot } from '../catalog/snapshot.ts';
import { assembleShopifyListing } from '../content/shopify-description.ts';
import { stripExternalHtml } from '../catalog/snapshot.ts';
import { normalizeTags } from '../review/review-normalization.ts';
import type { PublishingPlanChange } from './publishing-plan.ts';

export type CatalogCoreField = 'vendor' | 'productType';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

export function catalogValueIsApproved(value: string, approvedValues: readonly string[]): boolean {
  const candidate = normalized(value);
  return Boolean(candidate) && approvedValues.some((approved) => normalized(approved) === candidate);
}

export function resolveCatalogCoreValue(draft: ListingDraft, field: CatalogCoreField): string {
  const savedValue = draft.catalog[field].value.trim();
  if (savedValue) return savedValue;

  const acceptedFieldIds = field === 'vendor'
    ? new Set(['brand', 'vendor'])
    : new Set(['product_type', 'producttype', 'product-type']);
  const candidates = draft.reviewWorkspace?.facts.filter((fact) => (
    acceptedFieldIds.has((fact.fieldId ?? '').trim().toLocaleLowerCase('en-US'))
    && (fact.truthStatus ?? fact.status) === 'VERIFIED'
    && fact.value.trim()
  )).map(({ value }) => value.trim()) ?? [];
  const unique = [...new Map(candidates.map((value) => [normalized(value), value])).values()];
  return unique.length === 1 ? unique[0]! : '';
}

export function creationCoreChanges(
  draft: ListingDraft,
  preferences: EffectiveMerchantPreferences,
): PublishingPlanChange[] {
  const vendor = resolveCatalogCoreValue(draft, 'vendor');
  const productType = resolveCatalogCoreValue(draft, 'productType');
  const vendorApproved = catalogValueIsApproved(vendor, preferences.catalog.vendors);
  const productTypeApproved = catalogValueIsApproved(productType, preferences.catalog.productTypes);
  const seoTitleAllowed = preferences.publishing.policies.seo.title !== 'PRESERVE_EXISTING';
  const seoDescriptionAllowed = preferences.publishing.policies.seo.description !== 'PRESERVE_EXISTING';
  const handleAllowed = ['GENERATE_FOR_NEW_PRODUCTS_ONLY', 'MANAGED_BY_LISTINGPILOT'].includes(preferences.publishing.policies.handle.policy)
    && preferences.publishing.policies.seo.handle !== 'PRESERVE_EXISTING';
  const values: Array<readonly [string, string, PublishingPlanChange['group'], unknown, PublishingPlanChange['operation'], string | null]> = [
    ['product.title', 'Title', 'PRODUCT_CONTENT', draft.title.value, 'CREATE', null],
    ['product.descriptionHtml', 'Description', 'PRODUCT_CONTENT', assembleShopifyListing(draft).descriptionHtml, 'CREATE', null],
    ['product.vendor', 'Vendor', 'CATALOG', vendor, vendorApproved ? 'SET' : 'BLOCKED', vendorApproved ? null : vendor ? 'Vendor must be approved in the Catalog Profile.' : 'No verified Vendor or Brand is available in the saved Product draft.'],
    ['product.productType', 'Product type', 'CATALOG', productType, productTypeApproved ? 'SET' : 'BLOCKED', productTypeApproved ? null : productType ? 'Product type must be approved in the Catalog Profile.' : 'No verified Product Type is available in the saved Product draft.'],
    ['product.tags', 'Tags', 'TAGS', draft.catalog.tags.map(({ value }) => value), 'APPEND', null],
    ['product.status', 'Product status', 'STATUS', 'DRAFT', 'CREATE', null],
    ['product.seo.title', 'SEO title', 'SEO', draft.seo.title.value, seoTitleAllowed && draft.seo.title.value.trim() ? 'CREATE' : 'BLOCKED', seoTitleAllowed ? (draft.seo.title.value.trim() ? null : 'Add and review an SEO title before publishing.') : 'The Publishing Profile preserves Shopify SEO titles.'],
    ['product.seo.description', 'SEO description', 'SEO', draft.seo.description.value, seoDescriptionAllowed && draft.seo.description.value.trim() ? 'CREATE' : 'BLOCKED', seoDescriptionAllowed ? (draft.seo.description.value.trim() ? null : 'Add and review an SEO description before publishing.') : 'The Publishing Profile preserves Shopify SEO descriptions.'],
    ['product.handle', 'URL handle', 'SEO', draft.seo.handle.value, handleAllowed && draft.seo.handle.value.trim() ? 'CREATE' : 'BLOCKED', handleAllowed ? (draft.seo.handle.value.trim() ? null : 'Add and review a URL handle before publishing.') : 'The Publishing Profile lets Shopify preserve or generate the Product handle.'],
  ];
  return values.map(([fieldId, displayName, group, proposedValue, operation, blockedReason]) => ({
    fieldId, displayName, group, currentValue: null, proposedValue, operation,
    source: 'Reviewed Listing Draft', policy: 'Publishing Profile',
    risk: ['product.status', 'product.handle'].includes(fieldId) ? 'HIGH' : 'LOW',
    approvalRequired: true, selected: !blockedReason && fieldId !== 'product.status', blockedReason, resourceId: null,
  }));
}

export function enforceCoreUpdatePolicies(
  changes: readonly PublishingPlanChange[],
  preferences: EffectiveMerchantPreferences,
): PublishingPlanChange[] {
  return changes.map((change) => {
    let reason = change.blockedReason;
    if (change.fieldId === 'product.vendor' && !catalogValueIsApproved(String(change.proposedValue), preferences.catalog.vendors)) reason = 'Vendor must be approved in the Catalog Profile.';
    if (change.fieldId === 'product.productType' && !catalogValueIsApproved(String(change.proposedValue), preferences.catalog.productTypes)) reason = 'Product type must be approved in the Catalog Profile.';
    if (change.fieldId === 'product.seo.title' && (preferences.publishing.policies.seo.title === 'PRESERVE_EXISTING' || (preferences.publishing.policies.seo.title === 'PUBLISH_IF_EMPTY' && Boolean(change.currentValue)))) reason = 'The Publishing Profile preserves the existing Shopify SEO title.';
    if (change.fieldId === 'product.seo.description' && (preferences.publishing.policies.seo.description === 'PRESERVE_EXISTING' || (preferences.publishing.policies.seo.description === 'PUBLISH_IF_EMPTY' && Boolean(change.currentValue)))) reason = 'The Publishing Profile preserves the existing Shopify SEO description.';
    if (change.fieldId === 'product.handle' && (!['UPDATE_AFTER_APPROVAL', 'MANAGED_BY_LISTINGPILOT'].includes(preferences.publishing.policies.handle.policy) || preferences.publishing.policies.seo.handle === 'PRESERVE_EXISTING' || preferences.publishing.policies.handle.redirectPolicy === 'DO_NOT_CREATE_REDIRECT')) reason = 'The Publishing Profile preserves the existing Shopify URL handle.';
    return reason ? { ...change, operation: 'BLOCKED' as const, selected: false, blockedReason: reason } : change;
  });
}

export function selectedCoreProductPayload(changes: readonly PublishingPlanChange[]): Record<string, unknown> {
  const product: Record<string, unknown> = {};
  const direct: Record<string, string> = {
    'product.title': 'title',
    'product.descriptionHtml': 'descriptionHtml',
    'product.vendor': 'vendor',
    'product.productType': 'productType',
    'product.tags': 'tags',
    'product.status': 'status',
    'product.handle': 'handle',
  };
  const seo: Record<string, unknown> = {};
  for (const change of changes) {
    const key = direct[change.fieldId];
    if (key) product[key] = change.proposedValue;
    if (change.fieldId === 'product.seo.title') seo.title = change.proposedValue;
    if (change.fieldId === 'product.seo.description') seo.description = change.proposedValue;
  }
  if (Object.keys(seo).length) product.seo = seo;
  return product;
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, child) => (
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([left], [right]) => left.localeCompare(right)))
      : child
  ));
}

export function creationVerificationFailures(
  snapshot: ShopifyProductSnapshot,
  selected: readonly PublishingPlanChange[],
): string[] {
  const actual = new Map<string, unknown>([
    ['product.title', snapshot.product.title],
    ['product.descriptionHtml', stripExternalHtml(snapshot.product.descriptionHtml)],
    ['product.vendor', snapshot.product.vendor],
    ['product.productType', snapshot.product.productType],
    ['product.tags', normalizeTags(snapshot.product.tags)],
    ['product.status', snapshot.product.status],
    ['product.seo.title', snapshot.product.seo.title ?? ''],
    ['product.seo.description', snapshot.product.seo.description ?? ''],
    ['product.handle', snapshot.product.handle],
  ]);
  return selected.filter((change) => actual.has(change.fieldId)).filter((change) => {
    const expected = change.fieldId === 'product.descriptionHtml'
      ? stripExternalHtml(String(change.proposedValue ?? ''))
      : change.fieldId === 'product.tags' && Array.isArray(change.proposedValue)
        ? normalizeTags(change.proposedValue.map(String))
        : change.proposedValue;
    return canonical(actual.get(change.fieldId)) !== canonical(expected);
  }).map(({ fieldId }) => fieldId);
}
