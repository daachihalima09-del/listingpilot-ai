import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import { fetchShopifyCatalogProduct } from '../catalog/catalog-service';
import {
  normalizeShopifyProductSnapshot,
} from '../catalog/snapshot';
import { getShopifyConfig } from '../config';
import { generateShopifyChangeReview } from './review-engine';
import {
  createReviewRecord,
  findAuthorizedReview,
  hashReviewBaseline,
  resolveReviewProject,
} from './review-repository.server';
import { comparableSnapshot, remoteFingerprint } from './review-normalization';
import { validateReviewDecisions } from './review-decisions';
import { ShopifyReviewError } from './review-errors';
import { buildSelectiveUpdatePlan } from './selective-update-plan';
import type {
  ShopifyChangeReviewPayload,
  ShopifyReviewDecision,
} from './review-types';

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation ListingPilotSelectiveProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) { product { id updatedAt } userErrors { field message } }
  }
`;
const VARIANT_UPDATE_MUTATION = `#graphql
  mutation ListingPilotSelectiveVariantUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id }
      userErrors { field message }
    }
  }
`;
const METAFIELDS_SET_MUTATION = `#graphql
  mutation ListingPilotSelectiveMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
  }
`;
const MEDIA_ALT_MUTATION = `#graphql
  mutation ListingPilotSelectiveMediaAlt($files: [FileUpdateInput!]!) {
    fileUpdate(files: $files) { files { id } userErrors { field message } }
  }
`;

async function graphQlMutation(
  workspaceId: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<void> {
  const response = await requestShopifyAdminApi(workspaceId, {
    method: 'POST',
    path: '/graphql.json',
    body: { query, variables },
  });
  const envelope = response.data as {
    errors?: unknown[];
    data?: Record<string, { userErrors?: unknown[] } | null>;
  };
  if (
    envelope.errors?.length
    || !envelope.data
    || Object.values(envelope.data).some((value) => !value || value.userErrors?.length)
  ) {
    throw new ShopifyReviewError('SELECTIVE_PUBLISH_FAILED', 500, 'Shopify could not apply the approved changes.');
  }
}

export async function generateChangeReview(userId: string, projectId: string) {
  const context = await resolveReviewProject(userId, projectId);
  const config = getShopifyConfig();
  const rawRemote = await fetchShopifyCatalogProduct({
    request: (request) => requestShopifyAdminApi(context.workspaceId, request),
  }, context.shopifyProductGid);
  const generatedAt = new Date();
  const remote = normalizeShopifyProductSnapshot(rawRemote, config.apiVersion, generatedAt);
  const comparison = generateShopifyChangeReview({
    projectId,
    workspaceId: context.workspaceId,
    shopifyStoreId: context.shopifyStoreId,
    baseline: context.baseline,
    remote,
    project: context,
    generatedAt,
  });
  const record = await createReviewRecord({
    context,
    comparison,
    remoteFingerprint: remoteFingerprint(remote),
    generatedAt,
  });
  return { id: record.id, version: record.version, comparison };
}

function assertReviewFresh(
  review: Awaited<ReturnType<typeof findAuthorizedReview>>,
  context: Awaited<ReturnType<typeof resolveReviewProject>>,
): void {
  if (review.status === 'PUBLISHED') {
    throw new ShopifyReviewError('REVIEW_CONSUMED', 409, 'This review has already been published.');
  }
  if (
    review.status !== 'OPEN'
    || review.expiresAt <= new Date()
    || review.projectVersion !== context.projectVersion
    || review.shopifyStoreId !== context.shopifyStoreId
    || review.shopifyProductGid !== context.shopifyProductGid
    || review.baselineSnapshotHash !== hashReviewBaseline(context.baseline)
  ) {
    throw new ShopifyReviewError('REVIEW_STALE', 409, 'Refresh the comparison before publishing.');
  }
}

export async function updateReviewDecisions(
  userId: string,
  projectId: string,
  reviewId: string,
  untrusted: unknown,
) {
  const [review, context] = await Promise.all([
    findAuthorizedReview(userId, projectId, reviewId),
    resolveReviewProject(userId, projectId),
  ]);
  assertReviewFresh(review, context);
  if (context.role !== 'OWNER') {
    throw new ShopifyReviewError('WORKSPACE_FORBIDDEN', 403, 'Workspace owner permission is required.');
  }
  const input = untrusted as { version?: unknown };
  if (input.version !== review.version) {
    throw new ShopifyReviewError('REVIEW_VERSION_CONFLICT', 409, 'The review changed. Refresh and try again.');
  }
  let decisions: Record<string, ShopifyReviewDecision>;
  try {
    decisions = validateReviewDecisions(
      review.comparisonJson as unknown as ShopifyChangeReviewPayload,
      untrusted,
    );
  } catch {
    throw new ShopifyReviewError('INVALID_DECISION', 400, 'One or more review decisions are invalid.');
  }
  const updated = await prisma.shopifyChangeReview.updateMany({
    where: { id: review.id, version: review.version, status: 'OPEN' },
    data: {
      decisionsJson: decisions,
      version: { increment: 1 },
    },
  });
  if (updated.count !== 1) {
    throw new ShopifyReviewError('REVIEW_VERSION_CONFLICT', 409, 'The review changed. Refresh and try again.');
  }
  return { version: review.version + 1, decisions };
}

export async function publishApprovedReview(
  userId: string,
  projectId: string,
  reviewId: string,
) {
  const [review, context] = await Promise.all([
    findAuthorizedReview(userId, projectId, reviewId),
    resolveReviewProject(userId, projectId),
  ]);
  assertReviewFresh(review, context);
  if (context.role !== 'OWNER') {
    throw new ShopifyReviewError('WORKSPACE_FORBIDDEN', 403, 'Workspace owner permission is required.');
  }
  const comparison = review.comparisonJson as unknown as ShopifyChangeReviewPayload;
  const plan = buildSelectiveUpdatePlan({
    reviewId,
    reviewVersion: review.version,
    review: comparison,
    decisions: review.decisionsJson as Record<string, ShopifyReviewDecision>,
  });
  const config = getShopifyConfig();
  const fetchRemote = async () => normalizeShopifyProductSnapshot(
    await fetchShopifyCatalogProduct({
      request: (request) => requestShopifyAdminApi(context.workspaceId, request),
    }, context.shopifyProductGid),
    config.apiVersion,
  );
  const preflight = await fetchRemote();
  if (
    preflight.product.updatedAt !== comparison.remoteShopifyUpdatedAt
    || remoteFingerprint(preflight) !== review.remoteFingerprint
  ) {
    await prisma.shopifyChangeReview.updateMany({
      where: { id: review.id, status: 'OPEN' },
      data: { status: 'STALE' },
    });
    throw new ShopifyReviewError('REMOTE_CHANGED_AFTER_REVIEW', 409, 'Shopify changed after this review. Refresh the comparison.');
  }

  const productChanges: Record<string, unknown> = { id: context.shopifyProductGid };
  const productMap: Record<string, string> = {
    'product.title': 'title',
    'product.descriptionHtml': 'descriptionHtml',
    'product.vendor': 'vendor',
    'product.productType': 'productType',
    'product.tags': 'tags',
    'product.status': 'status',
  };
  for (const [path, value] of Object.entries(plan.productFieldChanges)) {
    if (productMap[path]) productChanges[productMap[path]] = value;
  }
  const seoTitle = plan.productFieldChanges['product.seo.title'];
  const seoDescription = plan.productFieldChanges['product.seo.description'];
  if (seoTitle !== undefined || seoDescription !== undefined) {
    productChanges.seo = {
      ...(seoTitle !== undefined ? { title: seoTitle } : {}),
      ...(seoDescription !== undefined ? { description: seoDescription } : {}),
    };
  }
  const operations = (
    Object.keys(productChanges).length > 1 ? 1 : 0
  ) + (plan.variantChanges.length ? 1 : 0)
    + (plan.metafieldChanges.length ? 1 : 0)
    + (plan.mediaChanges.length ? 1 : 0);
  if (!operations) {
    throw new ShopifyReviewError('NO_CHANGES_SELECTED', 409, 'Select at least one change to publish.');
  }

  if (Object.keys(productChanges).length > 1) {
    await graphQlMutation(context.workspaceId, PRODUCT_UPDATE_MUTATION, { product: productChanges });
  }
  if (plan.variantChanges.length) {
    await graphQlMutation(context.workspaceId, VARIANT_UPDATE_MUTATION, {
      productId: context.shopifyProductGid,
      variants: plan.variantChanges.map(({ variantId, fields }) => ({ id: variantId, ...fields })),
    });
  }
  if (plan.metafieldChanges.length) {
    await graphQlMutation(context.workspaceId, METAFIELDS_SET_MUTATION, {
      metafields: plan.metafieldChanges.map(({ namespace, key, value }) => ({
        ownerId: context.shopifyProductGid,
        namespace,
        key,
        ...(value && typeof value === 'object' ? value : {}),
      })),
    });
  }
  if (plan.mediaChanges.length) {
    await graphQlMutation(context.workspaceId, MEDIA_ALT_MUTATION, {
      files: plan.mediaChanges.map(({ mediaId, alt }) => ({ id: mediaId, alt })),
    });
  }

  const refreshed = await fetchRemote();
  const refreshedValues = comparableSnapshot(refreshed);
  const expected = [
    ...Object.entries(plan.productFieldChanges).map(([path, value]) => [path, value] as const),
    ...plan.variantChanges.flatMap(({ variantId, fields }) => Object.entries(fields).map(([field, value]) => [`variants.${variantId}.${field}`, value] as const)),
    ...plan.metafieldChanges.map(({ namespace, key, value }) => [`metafields.${namespace}.${key}`, value] as const),
    ...plan.mediaChanges.map(({ mediaId, alt }) => [`media.${mediaId}.alt`, alt] as const),
  ];
  const canonical = (value: unknown) => JSON.stringify(value, (_key, child) => (
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([left], [right]) => left.localeCompare(right)))
      : child
  ));
  const verificationFailed = expected.some(([path, value]) => (
    !refreshedValues.has(path) || canonical(refreshedValues.get(path)?.value) !== canonical(value)
  ));
  if (verificationFailed) {
    await prisma.auditLog.create({
      data: {
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        userId,
        action: 'shopify.publish_verification_failed',
        entityType: 'ShopifyChangeReview',
        entityId: review.id,
        metadata: { projectId, reviewVersion: review.version, expectedCount: expected.length },
      },
    });
    throw new ShopifyReviewError('POST_PUBLISH_VERIFICATION_FAILED', 409, 'Shopify changed, but verification did not match every approved change. Review the product before retrying.');
  }
  const publishedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.shopifyProductImportLink.update({
      where: { id: context.linkId },
      data: {
        sourceSnapshot: refreshed as unknown as Prisma.InputJsonValue,
        shopifyUpdatedAtAtImport: new Date(refreshed.product.updatedAt),
        lastSourceReadAt: publishedAt,
      },
    });
    await transaction.shopifyChangeReview.update({
      where: { id: review.id },
      data: { status: 'PUBLISHED', publishedAt },
    });
    await transaction.auditLog.create({
      data: {
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        userId,
        action: 'shopify.selective_publish_completed',
        entityType: 'ShopifyChangeReview',
        entityId: review.id,
        metadata: {
          projectId,
          selectedCount: operations,
          reviewVersion: review.version,
          outcome: 'COMPLETED',
        },
      },
    });
  });
  return {
    updatedFields: [
      ...Object.keys(plan.productFieldChanges),
      ...plan.variantChanges.flatMap(({ fields }) => Object.keys(fields)),
      ...plan.metafieldChanges.map(({ namespace, key }) => `${namespace}.${key}`),
      ...plan.mediaChanges.map(({ mediaId }) => `${mediaId}.alt`),
    ],
    skippedFields: plan.skippedFields,
  };
}
