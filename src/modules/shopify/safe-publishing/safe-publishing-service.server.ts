import 'server-only';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createMerchantPreferenceRegistry } from '../../merchant-preferences/default-registry';
import { prismaMerchantBusinessProfileRepository } from '../../merchant-preferences/prisma-repository.server';
import { getEffectiveMerchantPreferences } from '../../merchant-preferences/service';
import type { ListingDraft } from '../../listing-draft/domain/contracts';
import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import { listShopifyCatalog, fetchShopifyCatalogProduct } from '../catalog/catalog-service';
import { normalizeShopifyProductSnapshot, shopifyProductSnapshotSchema } from '../catalog/snapshot';
import { getShopifyConfig } from '../config';
import { generateShopifyChangeReview } from '../review/review-engine';
import { remoteFingerprint } from '../review/review-normalization';
import { publishUserShopifyProject } from '../publishing/publication-operations.server';
import { shopifyProductCreateInputSchema } from '../products/product-validation';
import { assembleShopifyListing } from '../content/shopify-description';
import { assessDuplicateProducts, identityFromDraft } from './duplicate-assessment';
import {
  changesFromReview,
  eligibilityBlockers,
  finalizePlan,
  isPublishingPlanContentCurrent,
  listingDraftFromProject,
  publishingDraftFingerprint,
  publishingPlanSelectionSchema,
  stableFingerprint,
  validatePlanReviewSelection,
  validatePlanSelection,
  type PublishingPlanChange,
  type ShopifyPublishingPlanPayload,
} from './publishing-plan';
import { SafePublishingError } from './safe-publishing-error';

export const preparePublishingSchema = z.object({
  intent: z.enum(['REVIEW', 'CREATE_NEW']).default('REVIEW'),
}).strict();

type ProjectContext = Awaited<ReturnType<typeof resolvePublishingProject>>;

async function resolvePublishingProject(userId: string, productId: string, containerProjectId?: string) {
  const project = await prisma.product.findFirst({
    where: { id: productId, ...(containerProjectId ? { projectId: containerProjectId } : {}), archivedAt: null, workspace: { organization: { memberships: { some: { userId } } } } },
    select: {
      id: true, projectId: true, workspaceId: true, version: true, status: true, generatedListing: true, seoData: true,
      workspace: { select: { organizationId: true, organization: { select: { memberships: { where: { userId }, take: 1, select: { role: true } } } }, shopifyStores: { where: { status: { in: ['CONNECTED', 'ACTIVE'] } }, take: 2, select: { id: true, workspaceId: true, status: true, shopDomain: true, shopName: true, accessTokenEncrypted: true } } } },
      shopifyProductPublication: { select: { shopifyProductId: true } },
      shopifyProductImportLink: { select: { id: true, status: true, workspaceId: true, shopifyStoreId: true, shopifyProductGid: true, shopifyProductLegacyId: true, sourceSnapshot: true, shopifyUpdatedAtAtImport: true } },
      shopifyVariantConfiguration: { select: { variants: { select: { id: true, shopifyVariantId: true, optionValues: true, price: true, compareAtPrice: true, sku: true, barcode: true, position: true, active: true } } } },
      shopifyMetafieldConfiguration: { select: { metafields: { select: { namespace: true, key: true, type: true, serializedValue: true, enabled: true } } } },
      shopifyImageConfiguration: { select: { images: { select: { id: true, shopifyMediaId: true, altText: true, position: true, active: true } } } },
    },
  });
  const role = project?.workspace.organization.memberships[0]?.role;
  if (!project || !role) throw new SafePublishingError('PUBLISHING_NOT_FOUND', 404, 'The requested project is unavailable.');
  const stores = project.workspace.shopifyStores;
  const linkedStore = project.shopifyProductImportLink
    ? stores.find(({ id }) => id === project.shopifyProductImportLink!.shopifyStoreId)
    : stores[0];
  return { ...project, role, store: linkedStore ?? null, storeCount: stores.length };
}

function verifyLinkage(context: ProjectContext): { valid: boolean; reason: string | null } {
  const link = context.shopifyProductImportLink;
  if (!link) return { valid: true, reason: null };
  const valid = Boolean(
    context.store
    && link.status === 'LINKED'
    && link.workspaceId === context.workspaceId
    && link.shopifyStoreId === context.store.id
    && context.shopifyProductPublication?.shopifyProductId === link.shopifyProductLegacyId
    && link.shopifyProductGid === `gid://shopify/Product/${link.shopifyProductLegacyId}`
  );
  return { valid, reason: valid ? null : "We could not safely verify this product's Shopify identity. Reconnect or relink the product before publishing." };
}

function creationChanges(draft: ListingDraft, preferences: Awaited<ReturnType<typeof getEffectiveMerchantPreferences>>): PublishingPlanChange[] {
  const assembledListing = assembleShopifyListing(draft);
  const productTypeApproved = preferences.catalog.productTypes.some((value) => value.localeCompare(draft.catalog.productType.value, undefined, { sensitivity: 'accent' }) === 0);
  const vendorApproved = preferences.catalog.vendors.some((value) => value.localeCompare(draft.catalog.vendor.value, undefined, { sensitivity: 'accent' }) === 0);
  const changes: PublishingPlanChange[] = [
    ['product.title', 'Title', 'PRODUCT_CONTENT', draft.title.value, 'CREATE', null],
    ['product.descriptionHtml', 'Description', 'PRODUCT_CONTENT', assembledListing.descriptionHtml, 'CREATE', null],
    ['product.vendor', 'Vendor', 'CATALOG', draft.catalog.vendor.value, vendorApproved ? 'SET' : 'BLOCKED', vendorApproved ? null : 'Vendor must be approved in the Catalog Profile.'],
    ['product.productType', 'Product type', 'CATALOG', draft.catalog.productType.value, productTypeApproved ? 'SET' : 'BLOCKED', productTypeApproved ? null : 'Product type must be approved in the Catalog Profile.'],
    ['product.tags', 'Tags', 'TAGS', draft.catalog.tags.map(({ value }) => value), 'APPEND', null],
    ['product.status', 'Product status', 'STATUS', 'DRAFT', 'CREATE', null],
    ['product.seo.title', 'SEO title', 'SEO', draft.seo.title.value, 'BLOCKED', 'SEO creation is not supported by the current verified product-create service.'],
    ['product.seo.description', 'SEO description', 'SEO', draft.seo.description.value, 'BLOCKED', 'SEO creation is not supported by the current verified product-create service.'],
    ['product.handle', 'URL handle', 'SEO', draft.seo.handle.value, 'BLOCKED', 'Shopify will create the initial handle; ListingPilot will not force it.'],
  ].map(([fieldId, displayName, group, proposedValue, operation, blockedReason]) => ({
    fieldId: String(fieldId), displayName: String(displayName), group: group as PublishingPlanChange['group'], currentValue: null, proposedValue,
    operation: operation as PublishingPlanChange['operation'], source: 'Reviewed Listing Draft', policy: 'Publishing Profile',
    risk: fieldId === 'product.status' ? 'HIGH' : 'LOW', approvalRequired: true,
    selected: !blockedReason && fieldId !== 'product.status', blockedReason: blockedReason ? String(blockedReason) : null, resourceId: null,
  }));
  for (const collection of draft.catalog.collections) changes.push({
    fieldId: `collections.${stableFingerprint(collection.value).slice(0, 12)}`, displayName: 'Collection suggestion', group: 'COLLECTIONS', currentValue: null, proposedValue: collection.value,
    operation: 'BLOCKED', source: 'Reviewed Listing Draft', policy: 'Suggest only; never create collections', risk: 'HIGH', approvalRequired: true, selected: false,
    blockedReason: 'Collection creation and automatic assignment are not supported.', resourceId: null,
  });
  return changes;
}

function enforceUpdatePolicies(changes: PublishingPlanChange[], preferences: Awaited<ReturnType<typeof getEffectiveMerchantPreferences>>): PublishingPlanChange[] {
  return changes.map((change) => {
    let reason = change.blockedReason;
    if (change.fieldId === 'product.vendor' && !preferences.catalog.vendors.includes(String(change.proposedValue))) reason = 'Vendor must be approved in the Catalog Profile.';
    if (change.fieldId === 'product.productType' && !preferences.catalog.productTypes.includes(String(change.proposedValue))) reason = 'Product type must be approved in the Catalog Profile.';
    if (change.group === 'PRICING' && preferences.publishing.policies.variants.price === 'PRESERVE_EXISTING') reason = 'Pricing is preserved by the Publishing Profile.';
    if (/(?:\.sku|\.barcode)$/u.test(change.fieldId)) reason = 'SKU and barcode are preserved by default.';
    if (change.fieldId === 'product.status' && preferences.publishing.policies.fieldPolicies.find(({ field }) => field === 'PRODUCT_STATUS')?.policy === 'PRESERVE_EXISTING') reason = 'Product status is preserved by the Publishing Profile.';
    if (change.group === 'METAFIELDS' && preferences.publishing.policies.metafields.namespacePolicy === 'EXISTING_DEFINITIONS_ONLY' && !change.resourceId) reason = 'Only existing verified metafield definitions may be updated.';
    return reason ? { ...change, operation: 'BLOCKED' as const, selected: false, blockedReason: reason } : change;
  });
}

async function duplicateAssessment(context: ProjectContext, draft: ListingDraft) {
  const identity = identityFromDraft(draft);
  const search = identity.modelNumber ?? identity.sku ?? identity.barcode ?? identity.title.slice(0, 100);
  const catalog = await listShopifyCatalog({
    requester: { request: (request) => requestShopifyAdminApi(context.workspaceId, request) },
    links: { async findMany() { return new Map(); } },
  }, context.workspaceId, { search, importState: 'ALL' });
  return { identity, ...assessDuplicateProducts(identity, catalog.products.map((product) => ({
    productGid: product.id, title: product.title, handle: product.handle, vendor: product.vendor, productType: product.productType,
  }))) };
}

export async function prepareSafePublishingPlan(userId: string, projectId: string, untrusted: unknown, containerProjectId?: string) {
  const request = preparePublishingSchema.parse(untrusted);
  const context = await resolvePublishingProject(userId, projectId, containerProjectId);
  const preferences = await getEffectiveMerchantPreferences(prismaMerchantBusinessProfileRepository, createMerchantPreferenceRegistry(), context.workspaceId);
  const draft = listingDraftFromProject(context.generatedListing);
  const baseBlockers = eligibilityBlockers({ role: context.role, draft, projectVersion: context.version, connected: Boolean(context.store?.accessTokenEncrypted), preferences });
  const linkage = verifyLinkage(context);
  if (context.storeCount > 1 && !context.shopifyProductImportLink) baseBlockers.push('Choose a Shopify store before preparing this product.');
  if (!linkage.valid && linkage.reason) baseBlockers.push(linkage.reason);
  if (!draft || !context.store) return persistPlan(context, userId, draft, preferences, 'BLOCKED', [], baseBlockers, null, null, { result: 'INSUFFICIENT_IDENTITY', candidates: [], reviewed: false });

  const now = new Date();
  let mode: ShopifyPublishingPlanPayload['mode'] = context.shopifyProductImportLink ? 'UPDATE_EXISTING' : request.intent === 'CREATE_NEW' ? 'CREATE_NEW' : 'BLOCKED';
  let changes: PublishingPlanChange[] = [];
  let remote: ReturnType<typeof normalizeShopifyProductSnapshot> | null = null;
  let duplicate: ShopifyPublishingPlanPayload['duplicateAssessment'] = { result: 'NO_MATCH', candidates: [], reviewed: false };
  if (mode === 'UPDATE_EXISTING' && linkage.valid) {
    const link = context.shopifyProductImportLink!;
    remote = normalizeShopifyProductSnapshot(await fetchShopifyCatalogProduct({ request: (request) => requestShopifyAdminApi(context.workspaceId, request) }, link.shopifyProductGid), getShopifyConfig().apiVersion, now);
    const baseline = shopifyProductSnapshotSchema.parse(link.sourceSnapshot);
    changes = enforceUpdatePolicies(changesFromReview(generateShopifyChangeReview({
      projectId, workspaceId: context.workspaceId, shopifyStoreId: context.store.id, baseline, remote, project: context, generatedAt: now,
    })), preferences);
  } else if (mode === 'CREATE_NEW') {
    const assessed = await duplicateAssessment(context, draft);
    duplicate = { result: assessed.result, candidates: assessed.candidates, reviewed: false };
    changes = creationChanges(draft, preferences);
    if (['EXACT_MATCH', 'STRONG_MATCH', 'INSUFFICIENT_IDENTITY'].includes(duplicate.result)) baseBlockers.push(
      duplicate.result === 'INSUFFICIENT_IDENTITY' ? 'Add a verified model number, SKU, or barcode before creating a Shopify product.' : 'A likely Shopify duplicate was found. Link the existing product instead of creating another.',
    );
  } else if (!context.shopifyProductImportLink) {
    baseBlockers.push('Choose Link Existing Product or explicitly choose Create New Product.');
  }
  if (baseBlockers.length) mode = 'BLOCKED';
  return persistPlan(context, userId, draft, preferences, mode, changes, baseBlockers, remote ? remoteFingerprint(remote) : null, remote?.product.updatedAt ?? null, duplicate);
}

async function persistPlan(
  context: ProjectContext, userId: string, draft: ListingDraft | null,
  preferences: Awaited<ReturnType<typeof getEffectiveMerchantPreferences>>, mode: ShopifyPublishingPlanPayload['mode'],
  changes: PublishingPlanChange[], blockers: string[], remoteHash: string | null, remoteUpdatedAt: string | null,
  duplicate: ShopifyPublishingPlanPayload['duplicateAssessment'],
) {
  if (!context.store) throw new SafePublishingError('SHOPIFY_CONNECTION_REQUIRED', 409, 'Connect your Shopify store before preparing for Shopify.');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
  const identity = draft ? identityFromDraft(draft) : { title: '', modelNumber: null, sku: null, barcode: null, vendor: '', productType: '' };
  const highImpact = changes.filter(({ risk, operation }) => risk === 'HIGH' && operation !== 'BLOCKED').map(({ fieldId }) => fieldId);
  const payload = finalizePlan({
    schemaVersion: 1, planVersion: 1, workspaceId: context.workspaceId, projectId: context.id, shopifyStoreId: context.store.id,
    mode, productIdentity: { title: identity.title, modelNumber: identity.modelNumber, sku: identity.sku, barcode: identity.barcode },
    listingPreview: draft ? assembleShopifyListing(draft) : null,
    shopifyLinkage: { verified: Boolean(context.shopifyProductImportLink && verifyLinkage(context).valid), productGid: context.shopifyProductImportLink?.shopifyProductGid ?? null },
    draftFingerprint: draft ? publishingDraftFingerprint(draft) : stableFingerprint(null), projectVersion: context.version,
    remoteFingerprint: remoteHash, remoteUpdatedAt, publishingProfileFingerprint: preferences.publishing.fingerprint,
    changes, blockers: [...new Set(blockers)], warnings: duplicate.result === 'POSSIBLE_MATCH' ? ['A possible Shopify duplicate needs your review.'] : [],
    highImpactOperations: highImpact, duplicateAssessment: duplicate,
    confirmationRequirements: [...highImpact, ...(mode === 'CREATE_NEW' ? ['CREATE_NEW_PRODUCT'] : [])],
    inventoryProtected: true, collectionsCreated: false, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
  });
  return prisma.$transaction(async (transaction) => {
    await transaction.shopifyPublishingPlan.updateMany({ where: { productId: context.id, projectId: context.projectId, workspaceId: context.workspaceId, status: 'OPEN' }, data: { status: 'STALE' } });
    const record = await transaction.shopifyPublishingPlan.create({ data: {
      projectId: context.projectId, productId: context.id, workspaceId: context.workspaceId, shopifyStoreId: context.store!.id, createdByUserId: userId,
      mode, shopifyProductGid: payload.shopifyLinkage.productGid, projectVersion: context.version, draftFingerprint: payload.draftFingerprint,
      remoteFingerprint: remoteHash, remoteUpdatedAt: remoteUpdatedAt ? new Date(remoteUpdatedAt) : null, planFingerprint: payload.planFingerprint,
      payload: payload as unknown as Prisma.InputJsonValue, expiresAt,
    } });
    await transaction.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: 'shopify.publish_plan_prepared', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId: context.id, storeId: context.store!.id, mode, changes: changes.length, blockers: blockers.length, warnings: payload.warnings.length, planVersion: 1 } } });
    if (['EXACT_MATCH', 'STRONG_MATCH'].includes(duplicate.result)) {
      await transaction.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: 'shopify.duplicate_creation_blocked', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId: context.id, storeId: context.store!.id, duplicateResult: duplicate.result, candidateCount: duplicate.candidates.length } } });
    }
    return { id: record.id, status: record.status, plan: payload, store: { name: context.store!.shopName, domain: context.store!.shopDomain } };
  });
}

export async function getSafePublishingPlan(userId: string, projectId: string, planId?: string, containerProjectId?: string) {
  const context = await resolvePublishingProject(userId, projectId, containerProjectId);
  const record = await prisma.shopifyPublishingPlan.findFirst({ where: { productId: projectId, projectId: context.projectId, workspaceId: context.workspaceId, ...(planId ? { id: planId } : {}) }, orderBy: { createdAt: 'desc' } });
  if (!record) return null;
  const currentDraft = listingDraftFromProject(context.generatedListing);
  const contentCurrent = isPublishingPlanContentCurrent({
    productVersion: context.version,
    planProductVersion: record.projectVersion,
    currentDraft,
    planDraftFingerprint: record.draftFingerprint,
  });
  // A workspace navigation without an explicit immutable plan ID must not bind
  // the merchant to blockers captured before the Product draft was saved.
  // Explicit plan links remain available and are reported stale below.
  if (!planId && !contentCurrent) return null;
  return { id: record.id, version: record.planVersion, status: record.status, stale: record.status !== 'OPEN' || record.expiresAt <= new Date() || !contentCurrent, plan: record.payload as unknown as ShopifyPublishingPlanPayload, selection: record.reviewSelection, store: context.store ? { name: context.store.shopName, domain: context.store.shopDomain } : null };
}

export async function saveSafePublishingReview(userId: string, projectId: string, untrusted: unknown, containerProjectId?: string) {
  const input = publishingPlanSelectionSchema.parse(untrusted);
  const context = await resolvePublishingProject(userId, projectId, containerProjectId);
  if (context.role !== 'OWNER') throw new SafePublishingError('PUBLISHING_FORBIDDEN', 403, 'Only the workspace owner can save publishing decisions.');
  const record = await prisma.shopifyPublishingPlan.findFirst({ where: { id: input.planId, productId: projectId, projectId: context.projectId, workspaceId: context.workspaceId } });
  if (!record || record.status !== 'OPEN' || record.expiresAt <= new Date()) throw new SafePublishingError('PLAN_STALE', 409, 'Refresh the comparison before saving your review.');
  const plan = record.payload as unknown as ShopifyPublishingPlanPayload;
  try { validatePlanReviewSelection(plan, input); } catch (error) { throw new SafePublishingError(error instanceof Error ? error.message : 'INVALID_SELECTION', 409, 'Review the selected changes.'); }
  await prisma.$transaction([
    prisma.shopifyPublishingPlan.update({ where: { id: record.id }, data: { reviewSelection: input as unknown as Prisma.InputJsonValue } }),
    prisma.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: 'shopify.publish_plan_reviewed', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId, mode: plan.mode, selectedCount: input.selectedFieldIds.length, highImpactConfirmationCount: input.confirmations.length } } }),
  ]);
  return { saved: true };
}

function selectedProductPayload(changes: PublishingPlanChange[]) {
  const product: Record<string, unknown> = {};
  const mapping: Record<string, string> = { 'product.title': 'title', 'product.descriptionHtml': 'descriptionHtml', 'product.vendor': 'vendor', 'product.productType': 'productType', 'product.tags': 'tags', 'product.status': 'status' };
  for (const change of changes) if (mapping[change.fieldId]) product[mapping[change.fieldId]] = change.proposedValue;
  return product;
}

export async function executeSafePublishingPlan(userId: string, projectId: string, untrusted: unknown, containerProjectId?: string) {
  const input = publishingPlanSelectionSchema.parse(untrusted);
  const context = await resolvePublishingProject(userId, projectId, containerProjectId);
  if (context.role !== 'OWNER') throw new SafePublishingError('PUBLISHING_FORBIDDEN', 403, 'Only the workspace owner can publish Shopify changes.');
  const record = await prisma.shopifyPublishingPlan.findFirst({ where: { id: input.planId, productId: projectId, projectId: context.projectId, workspaceId: context.workspaceId } });
  if (!record) throw new SafePublishingError('PLAN_NOT_FOUND', 404, 'The publishing plan is unavailable.');
  if (record.status !== 'OPEN' || record.expiresAt <= new Date()) throw new SafePublishingError('PLAN_STALE', 409, 'Refresh the comparison before publishing.');
  const plan = record.payload as unknown as ShopifyPublishingPlanPayload;
  let selected: PublishingPlanChange[];
  try { selected = validatePlanSelection(plan, input); } catch (error) { throw new SafePublishingError(error instanceof Error ? error.message : 'INVALID_SELECTION', 409, 'Review the selected changes and required confirmations.'); }
  if (!selected.length) throw new SafePublishingError('NO_CHANGES_SELECTED', 409, 'Select at least one permitted change.');
  const draft = listingDraftFromProject(context.generatedListing);
  if (!draft || publishingDraftFingerprint(draft) !== plan.draftFingerprint || context.version !== plan.projectVersion || context.store?.id !== plan.shopifyStoreId) throw new SafePublishingError('PLAN_STALE', 409, 'The project changed after your review. Refresh the comparison.');
  const preferences = await getEffectiveMerchantPreferences(prismaMerchantBusinessProfileRepository, createMerchantPreferenceRegistry(), context.workspaceId);
  if (preferences.publishing.fingerprint !== plan.publishingProfileFingerprint) throw new SafePublishingError('PLAN_STALE', 409, 'Publishing preferences changed after your review. Refresh the comparison.');
  if (plan.mode === 'BLOCKED') throw new SafePublishingError('PLAN_BLOCKED', 409, 'Resolve the publishing blockers before continuing.');

  if (plan.mode === 'UPDATE_EXISTING') {
    const linkage = verifyLinkage(context);
    if (!linkage.valid || context.shopifyProductImportLink?.shopifyProductGid !== plan.shopifyLinkage.productGid) throw new SafePublishingError('LINK_INCONSISTENT', 409, "We could not safely verify this product's Shopify identity.");
    const remote = normalizeShopifyProductSnapshot(await fetchShopifyCatalogProduct({ request: (request) => requestShopifyAdminApi(context.workspaceId, request) }, plan.shopifyLinkage.productGid!), getShopifyConfig().apiVersion);
    if (remote.product.updatedAt !== plan.remoteUpdatedAt || remoteFingerprint(remote) !== plan.remoteFingerprint) throw new SafePublishingError('REMOTE_CHANGED_AFTER_REVIEW', 409, 'This Shopify product changed after your review. Refresh the comparison before publishing.');
  } else {
    const reassessed = await duplicateAssessment(context, draft);
    if (
      reassessed.result !== plan.duplicateAssessment.result
      || stableFingerprint(reassessed.candidates.map(({ productGid }) => productGid).sort()) !== stableFingerprint(plan.duplicateAssessment.candidates.map(({ productGid }) => productGid).sort())
      || ['EXACT_MATCH', 'STRONG_MATCH', 'INSUFFICIENT_IDENTITY'].includes(reassessed.result)
    ) throw new SafePublishingError('DUPLICATE_STATE_CHANGED', 409, 'The duplicate assessment changed. Refresh before creating this product.');
  }

  const createProduct = plan.mode === 'CREATE_NEW'
    ? shopifyProductCreateInputSchema.parse({ ...selectedProductPayload(selected), status: 'DRAFT' })
    : null;

  const executionKey = stableFingerprint({ plan: record.id, version: record.planVersion, selected: input.selectedFieldIds, confirmations: input.confirmations }).slice(0, 64);
  const claimed = await prisma.shopifyPublishingPlan.updateMany({ where: { id: record.id, status: 'OPEN', planVersion: input.planVersion, planFingerprint: input.planFingerprint }, data: { status: 'EXECUTING', executionKey } });
  if (claimed.count !== 1) throw new SafePublishingError('EXECUTION_ALREADY_STARTED', 409, 'This publishing plan has already been started.');
  await prisma.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: 'shopify.publish_started', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId, mode: plan.mode, selectedCount: selected.length, planVersion: record.planVersion } } });

  let mutationAttempted = false;
  try {
    if (plan.mode === 'CREATE_NEW') {
      const result = await publishUserShopifyProject(userId, projectId, { product: createProduct });
      mutationAttempted = true;
      if (result.outcome === 'LINK_PENDING') {
        await prisma.shopifyPublishingPlan.update({ where: { id: record.id }, data: { status: 'PARTIAL', executedAt: new Date() } });
        throw new SafePublishingError('UNCERTAIN_REMOTE_STATE', 409, 'Shopify created the product, but ListingPilot could not verify the local link. Manual recovery is required.');
      }
      const productGid = `gid://shopify/Product/${result.publication.id}`;
      const verified = normalizeShopifyProductSnapshot(await fetchShopifyCatalogProduct({ request: (request) => requestShopifyAdminApi(context.workspaceId, request) }, productGid), getShopifyConfig().apiVersion);
      if (verified.product.status !== 'DRAFT' || selected.some((change) => change.fieldId === 'product.title' && verified.product.title !== change.proposedValue)) throw new SafePublishingError('POST_PUBLISH_VERIFICATION_FAILED', 409, 'Shopify changed, but verification did not match the approved plan. Review the product in Shopify.');
      await completePlan(record.id, context, userId, 'shopify.publish_completed', { outcome: 'SUCCESS', productGid });
      return { outcome: 'SUCCESS' as const, completedOperations: selected.map(({ fieldId }) => fieldId), failedOperations: [], skippedOperations: plan.changes.filter((change) => !input.selectedFieldIds.includes(change.fieldId)).map(({ fieldId }) => fieldId), remoteVerification: 'VERIFIED' as const, recoveryRequired: false, safeRetryAllowed: false, productGid };
    }

    const review = await import('../review/review-service.server');
    const preparedReview = await review.generateChangeReview(userId, projectId);
    const decisions = Object.fromEntries(preparedReview.comparison.fields.map((field) => [
      field.fieldPath,
      input.selectedFieldIds.includes(field.fieldPath)
        ? 'USE_LISTINGPILOT'
        : field.availableDecisions.includes('KEEP_SHOPIFY') ? 'KEEP_SHOPIFY' : 'SKIP',
    ]));
    await review.updateReviewDecisions(userId, projectId, preparedReview.id, { version: preparedReview.version, decisions });
    mutationAttempted = true;
    const result = await review.publishApprovedReview(userId, projectId, preparedReview.id);
    await completePlan(record.id, context, userId, 'shopify.publish_completed', { outcome: 'SUCCESS', updatedCount: result.updatedFields.length });
    return { outcome: 'SUCCESS' as const, completedOperations: result.updatedFields, failedOperations: [], skippedOperations: result.skippedFields, remoteVerification: 'VERIFIED' as const, recoveryRequired: false, safeRetryAllowed: false, productGid: plan.shopifyLinkage.productGid };
  } catch (error) {
    if (error instanceof SafePublishingError && error.code === 'UNCERTAIN_REMOTE_STATE') throw error;
    if (mutationAttempted) {
      await prisma.$transaction([
        prisma.shopifyPublishingPlan.update({ where: { id: record.id }, data: { status: 'PARTIAL', executedAt: new Date() } }),
        prisma.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: error instanceof Error && error.message.includes('verification') ? 'shopify.publish_verification_failed' : 'shopify.publish_partially_completed', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId, mode: plan.mode, result: 'UNCERTAIN_REMOTE_STATE' } } }),
      ]);
      throw new SafePublishingError('UNCERTAIN_REMOTE_STATE', 409, 'Shopify may have applied part of this plan. Review the product in Shopify before retrying.', { cause: error });
    }
    await prisma.$transaction([
      prisma.shopifyPublishingPlan.update({ where: { id: record.id }, data: { status: 'FAILED', executedAt: new Date() } }),
      prisma.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action: 'shopify.publish_failed', entityType: 'ShopifyPublishingPlan', entityId: record.id, metadata: { projectId, mode: plan.mode, result: 'FAILED_AFTER_EXECUTION_STARTED' } } }),
    ]);
    if (error instanceof SafePublishingError) throw error;
    throw new SafePublishingError('PUBLISH_FAILED', 502, 'Shopify could not apply and verify the approved changes.', { cause: error });
  }
}

async function completePlan(id: string, context: ProjectContext, userId: string, action: string, metadata: Record<string, unknown>) {
  await prisma.$transaction([
    prisma.shopifyPublishingPlan.update({ where: { id }, data: { status: 'COMPLETED', executedAt: new Date() } }),
    prisma.auditLog.create({ data: { organizationId: context.workspace.organizationId, workspaceId: context.workspaceId, userId, action, entityType: 'ShopifyPublishingPlan', entityId: id, metadata: { projectId: context.id, ...metadata } as Prisma.InputJsonValue } }),
  ]);
}
