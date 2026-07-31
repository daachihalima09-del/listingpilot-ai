import type {
  ShopifyChangeReviewPayload,
  ShopifyReviewDecision,
} from './review-types.ts';

export interface ShopifySelectiveUpdatePlan {
  mode: 'UPDATE';
  projectId: string;
  productGid: string;
  reviewId: string;
  reviewVersion: number;
  expectedRemoteUpdatedAt: string;
  productFieldChanges: Record<string, unknown>;
  variantChanges: Array<{ variantId: string; fields: Record<string, unknown> }>;
  metafieldChanges: Array<{ namespace: string; key: string; value: unknown }>;
  mediaChanges: Array<{ mediaId: string; alt: unknown }>;
  skippedFields: string[];
  unresolvedConflicts: string[];
  blockers: string[];
}

export function buildSelectiveUpdatePlan(input: {
  reviewId: string;
  reviewVersion: number;
  review: ShopifyChangeReviewPayload;
  decisions: Record<string, ShopifyReviewDecision>;
}): ShopifySelectiveUpdatePlan {
  const plan: ShopifySelectiveUpdatePlan = {
    mode: 'UPDATE',
    projectId: input.review.projectId,
    productGid: input.review.shopifyProductGid,
    reviewId: input.reviewId,
    reviewVersion: input.reviewVersion,
    expectedRemoteUpdatedAt: input.review.remoteShopifyUpdatedAt,
    productFieldChanges: {},
    variantChanges: [],
    metafieldChanges: [],
    mediaChanges: [],
    skippedFields: [],
    unresolvedConflicts: [],
    blockers: [],
  };
  for (const field of input.review.fields) {
    const decision = input.decisions[field.fieldPath] ?? field.defaultDecision;
    if (field.classification === 'CONFLICT' && !decision) {
      plan.unresolvedConflicts.push(field.fieldPath);
      continue;
    }
    if (decision !== 'USE_LISTINGPILOT') {
      plan.skippedFields.push(field.fieldPath);
      continue;
    }
    if (!field.publishable || field.classification === 'BLOCKED') {
      plan.blockers.push(field.fieldPath);
      continue;
    }
    if (field.resourceType === 'PRODUCT') {
      plan.productFieldChanges[field.fieldPath] = field.localValue;
    } else if (field.resourceType === 'VARIANT' && field.resourceId) {
      let variant = plan.variantChanges.find(({ variantId }) => variantId === field.resourceId);
      if (!variant) {
        variant = { variantId: field.resourceId, fields: {} };
        plan.variantChanges.push(variant);
      }
      variant.fields[field.fieldPath.split('.').at(-1)!] = field.localValue;
    } else if (field.resourceType === 'METAFIELD') {
      const [, namespace, key] = field.fieldPath.split('.');
      plan.metafieldChanges.push({ namespace, key, value: field.localValue });
    } else if (field.resourceType === 'MEDIA' && field.resourceId) {
      plan.mediaChanges.push({ mediaId: field.resourceId, alt: field.localValue });
    }
  }
  if (plan.unresolvedConflicts.length) throw new Error('UNRESOLVED_CONFLICT');
  if (plan.blockers.length) throw new Error('SELECTED_FIELD_BLOCKED');
  return plan;
}

