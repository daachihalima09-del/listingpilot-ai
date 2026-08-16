import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { EffectiveMerchantPreferences } from '../../merchant-preferences/effective-preferences.ts';
import type { ListingDraft } from '../../listing-draft/domain/contracts.ts';
import type { AssembledShopifyListing } from '../content/shopify-description.ts';
import type { ShopifyChangeReviewPayload, ShopifyReviewField } from '../review/review-types.ts';

export const publishingPlanModes = ['UPDATE_EXISTING', 'CREATE_NEW', 'BLOCKED'] as const;
export const duplicateAssessmentResults = [
  'NO_MATCH', 'POSSIBLE_MATCH', 'STRONG_MATCH', 'EXACT_MATCH', 'INSUFFICIENT_IDENTITY',
] as const;
export const publishingChangeGroups = [
  'PRODUCT_CONTENT', 'SEO', 'CATALOG', 'VARIANTS', 'PRICING', 'IMAGES',
  'METAFIELDS', 'TAGS', 'COLLECTIONS', 'STATUS',
] as const;
export type PublishingPlanMode = typeof publishingPlanModes[number];
export type DuplicateAssessmentResult = typeof duplicateAssessmentResults[number];
export type PublishingChangeGroup = typeof publishingChangeGroups[number];

export interface DuplicateCandidate {
  readonly productGid: string;
  readonly title: string;
  readonly handle: string;
  readonly vendor: string;
  readonly productType: string;
  readonly reason: string;
}

export interface PublishingPlanChange {
  readonly fieldId: string;
  readonly displayName: string;
  readonly group: PublishingChangeGroup;
  readonly currentValue: unknown;
  readonly proposedValue: unknown;
  readonly operation: 'NO_CHANGE' | 'SET' | 'UPDATE' | 'APPEND' | 'REMOVE' | 'CREATE' | 'BLOCKED';
  readonly source: string;
  readonly policy: string;
  readonly risk: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly approvalRequired: boolean;
  readonly selected: boolean;
  readonly blockedReason: string | null;
  readonly resourceId: string | null;
}

export interface ShopifyPublishingPlanPayload {
  readonly schemaVersion: 1;
  readonly planVersion: 1;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly shopifyStoreId: string;
  readonly mode: PublishingPlanMode;
  readonly productIdentity: Readonly<{ title: string; modelNumber: string | null; sku: string | null; barcode: string | null }>;
  readonly listingPreview: AssembledShopifyListing | null;
  readonly shopifyLinkage: Readonly<{ verified: boolean; productGid: string | null }>;
  readonly draftFingerprint: string;
  readonly projectVersion: number;
  readonly remoteFingerprint: string | null;
  readonly remoteUpdatedAt: string | null;
  readonly publishingProfileFingerprint: string;
  readonly changes: readonly PublishingPlanChange[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly highImpactOperations: readonly string[];
  readonly duplicateAssessment: Readonly<{ result: DuplicateAssessmentResult; candidates: readonly DuplicateCandidate[]; reviewed: boolean }>;
  readonly confirmationRequirements: readonly string[];
  readonly inventoryProtected: true;
  readonly collectionsCreated: false;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly planFingerprint: string;
}

export const publishingPlanSelectionSchema = z.object({
  planId: z.string().uuid(),
  planVersion: z.number().int().positive(),
  planFingerprint: z.string().length(64),
  selectedFieldIds: z.array(z.string().min(1).max(500)).max(250),
  confirmations: z.array(z.string().min(1).max(100)).max(30),
  duplicateCandidateReviewed: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if (new Set(value.selectedFieldIds).size !== value.selectedFieldIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['selectedFieldIds'], message: 'Selected changes must be unique.' });
  }
  if (new Set(value.confirmations).size !== value.confirmations.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmations'], message: 'Confirmations must be unique.' });
  }
});

export function stableFingerprint(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.entries(item).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, normalize(child)]),
    );
    return item;
  };
  return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
}

export function listingDraftFromProject(value: unknown): ListingDraft | null {
  if (!value || typeof value !== 'object') return null;
  const container = value as Record<string, unknown>;
  const candidate = container.listingDraft ?? value;
  if (!candidate || typeof candidate !== 'object') return null;
  const draft = candidate as Partial<ListingDraft>;
  return draft.schemaVersion === 1 && typeof draft.draftId === 'string' ? draft as ListingDraft : null;
}

export function publishingDraftFingerprint(draft: ListingDraft): string {
  return stableFingerprint({
    draftId: draft.draftId,
    status: draft.status,
    updatedAt: draft.updatedAt,
    title: draft.title,
    overview: draft.overview,
    specifications: draft.specifications,
    features: draft.features,
    seo: draft.seo,
    catalog: draft.catalog,
    metafields: draft.metafields,
    media: draft.media,
    reviewWorkspace: draft.reviewWorkspace,
  });
}

export function isPublishingPlanContentCurrent(input: Readonly<{
  productVersion: number;
  planProductVersion: number;
  currentDraft: ListingDraft | null;
  planDraftFingerprint: string;
}>): boolean {
  return input.productVersion === input.planProductVersion
    && (input.currentDraft
      ? publishingDraftFingerprint(input.currentDraft)
      : stableFingerprint(null)) === input.planDraftFingerprint;
}

export function requiredReviewSectionsComplete(draft: ListingDraft): boolean {
  const reviewed = new Set(draft.reviewWorkspace?.reviewedSections ?? []);
  return ['TITLE', 'OVERVIEW', 'SPECIFICATIONS', 'FEATURES', 'SEO', 'CATALOG'].every((section) => reviewed.has(section as never));
}

export function eligibilityBlockers(input: {
  role: string;
  draft: ListingDraft | null;
  projectVersion: number;
  connected: boolean;
  preferences: EffectiveMerchantPreferences;
}): string[] {
  const blockers: string[] = [];
  if (input.role !== 'OWNER') blockers.push('Only the workspace owner can prepare Shopify changes.');
  if (!input.draft || input.draft.status !== 'SAVED') blockers.push('Save the Listing Draft before preparing for Shopify.');
  if (input.draft && !requiredReviewSectionsComplete(input.draft)) blockers.push('Review the required listing sections before preparing for Shopify.');
  if (input.draft?.reviewWorkspace?.craft?.status === 'REJECTED') blockers.push('Resolve rejected Craft compliance findings before publishing.');
  if (input.draft?.reviewWorkspace?.facts.some((fact) => ['CONFLICT', 'CRITICAL_CONFLICT', 'REJECTED'].includes(fact.truthStatus ?? fact.status))) blockers.push('Resolve critical Product Truth conflicts before publishing.');
  if (!input.connected) blockers.push('Connect your Shopify store.');
  if (!input.preferences.publishing.complete) blockers.push('Complete the Publishing Profile.');
  if (input.draft && input.draft.projectId && input.draft.projectId.length > 0 && input.projectVersion < 1) blockers.push('Refresh the project before publishing.');
  return blockers;
}

function groupFor(field: ShopifyReviewField): PublishingChangeGroup {
  if (field.resourceType === 'VARIANT') return ['price', 'compareAtPrice'].some((name) => field.fieldPath.endsWith(`.${name}`)) ? 'PRICING' : 'VARIANTS';
  if (field.resourceType === 'MEDIA') return 'IMAGES';
  if (field.resourceType === 'METAFIELD') return 'METAFIELDS';
  if (field.fieldPath.startsWith('product.seo.')) return 'SEO';
  if (field.fieldPath === 'product.tags') return 'TAGS';
  if (field.fieldPath === 'product.status') return 'STATUS';
  if (['product.vendor', 'product.productType'].includes(field.fieldPath)) return 'CATALOG';
  return 'PRODUCT_CONTENT';
}

function riskFor(field: ShopifyReviewField): PublishingPlanChange['risk'] {
  return field.warningCodes.some((code) => ['STOREFRONT_VISIBILITY', 'VARIANT_PRICE', 'VARIANT_SKU'].includes(code))
    || /(?:handle|barcode)$/u.test(field.fieldPath) ? 'HIGH' : field.classification === 'CONFLICT' ? 'MEDIUM' : 'LOW';
}

export function changesFromReview(review: ShopifyChangeReviewPayload): PublishingPlanChange[] {
  return review.fields.filter(({ classification }) => classification !== 'UNCHANGED').map((field) => {
    const group = groupFor(field);
    const destructive = ['LOCAL_REMOVED', 'REMOTE_REMOVED', 'BOTH_REMOVED'].includes(field.classification);
    const blockedReason = !field.publishable || destructive
      ? destructive ? 'Destructive changes are not supported by safe publishing.' : 'This change cannot be applied safely.'
      : null;
    const risk = riskFor(field);
    let proposedValue = field.localValue;
    let operation: PublishingPlanChange['operation'] = blockedReason ? 'BLOCKED' : 'UPDATE';
    if (group === 'TAGS' && Array.isArray(field.remoteValue) && Array.isArray(field.localValue)) {
      proposedValue = [...new Set([...field.remoteValue, ...field.localValue])];
      operation = 'APPEND';
    }
    return {
      fieldId: field.fieldPath,
      displayName: field.label,
      group,
      currentValue: field.remoteValue,
      proposedValue,
      operation,
      source: 'Reviewed Listing Draft',
      policy: group === 'TAGS' ? 'Preserve existing tags and append approved tags' : 'Publishing Profile',
      risk,
      approvalRequired: true,
      selected: !blockedReason && risk === 'LOW' && field.classification !== 'CONFLICT',
      blockedReason,
      resourceId: field.resourceId,
    };
  });
}

export function finalizePlan(input: Omit<ShopifyPublishingPlanPayload, 'planFingerprint'>): ShopifyPublishingPlanPayload {
  return Object.freeze({ ...input, planFingerprint: stableFingerprint(input) });
}

export function validatePlanSelection(plan: ShopifyPublishingPlanPayload, input: z.infer<typeof publishingPlanSelectionSchema>): PublishingPlanChange[] {
  const selected = validatePlanReviewSelection(plan, input);
  const confirmations = new Set(input.confirmations);
  for (const change of selected) if (change.risk === 'HIGH' && !confirmations.has(change.fieldId)) throw new Error('HIGH_IMPACT_CONFIRMATION_REQUIRED');
  if (plan.mode === 'CREATE_NEW' && !confirmations.has('CREATE_NEW_PRODUCT')) throw new Error('CREATE_CONFIRMATION_REQUIRED');
  if (plan.duplicateAssessment.result === 'POSSIBLE_MATCH' && !input.duplicateCandidateReviewed) throw new Error('DUPLICATE_REVIEW_REQUIRED');
  return selected;
}

export function validatePlanReviewSelection(plan: ShopifyPublishingPlanPayload, input: z.infer<typeof publishingPlanSelectionSchema>): PublishingPlanChange[] {
  if (input.planVersion !== plan.planVersion || input.planFingerprint !== plan.planFingerprint) throw new Error('PLAN_STALE');
  const available = new Map(plan.changes.map((change) => [change.fieldId, change]));
  const selected = input.selectedFieldIds.map((id) => available.get(id));
  if (selected.some((change) => !change || change.operation === 'BLOCKED')) throw new Error('INVALID_SELECTION');
  return selected as PublishingPlanChange[];
}
