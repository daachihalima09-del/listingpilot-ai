import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  executeSafePublishingPlan,
  prepareSafePublishingPlan,
  saveSafePublishingReview,
} from '../safe-publishing/safe-publishing-service.server';
import { SafePublishingError } from '../safe-publishing/safe-publishing-error';
import {
  listingDraftFromProject,
  publishingDraftFingerprint,
  type ShopifyPublishingPlanPayload,
} from '../safe-publishing/publishing-plan';
import {
  assertAuthorizedProductSelection,
  buildBulkPublishingItemCreates,
  bulkExecuteSchema,
  bulkItemActionSchema,
  bulkPrepareSchema,
  deriveBatchStatus,
  isBulkPlanFresh,
  runWithConcurrency,
  summarizeBulkResults,
} from './bulk-publishing';

type BatchRecord = Awaited<ReturnType<typeof loadBatchRecord>>;

async function resolveProjectAccess(userId: string, projectId: string, workspaceId: string, ownerRequired: boolean) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId, workspace: { organization: { memberships: { some: { userId } } } } },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { organizationId: true, organization: { select: { memberships: { where: { userId }, take: 1, select: { role: true } } } } } },
    },
  });
  const role = project?.workspace.organization.memberships[0]?.role;
  if (!project || !role) throw new SafePublishingError('BULK_PROJECT_NOT_FOUND', 404, 'The requested Project is unavailable.');
  if (ownerRequired && role !== 'OWNER') throw new SafePublishingError('BULK_PUBLISHING_FORBIDDEN', 403, 'Only the workspace owner can manage bulk publishing.');
  return { ...project, role, organizationId: project.workspace.organizationId };
}

async function loadBatchRecord(userId: string, projectId: string, batchId: string) {
  const batch = await prisma.shopifyBulkPublishingBatch.findFirst({
    where: { id: batchId, projectId, project: { workspace: { organization: { memberships: { some: { userId } } } } } },
    include: {
      project: { select: { name: true } },
      items: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          product: { select: { id: true, name: true, version: true, generatedListing: true, shopifyProductImportLink: { select: { status: true, shopifyProductGid: true } } } },
          publishingPlan: true,
        },
      },
    },
  });
  if (!batch) throw new SafePublishingError('BULK_BATCH_NOT_FOUND', 404, 'The bulk publishing review is unavailable.');
  return batch;
}

function itemIsStale(item: BatchRecord['items'][number]): boolean {
  const plan = item.publishingPlan;
  if (!plan) return true;
  const draft = listingDraftFromProject(item.product.generatedListing);
  return !isBulkPlanFresh({
    status: plan.status,
    expiresAt: plan.expiresAt,
    now: new Date(),
    productVersion: item.product.version,
    planProductVersion: plan.projectVersion,
    currentDraftFingerprint: draft ? publishingDraftFingerprint(draft) : null,
    planDraftFingerprint: plan.draftFingerprint,
  });
}

function batchDto(batch: BatchRecord) {
  const items = batch.items.map((item) => {
    const stale = ['READY', 'PREPARING'].includes(item.status) && itemIsStale(item);
    const plan = item.publishingPlan?.payload as unknown as ShopifyPublishingPlanPayload | undefined;
    return {
      id: item.id,
      product: { id: item.product.id, name: item.product.name },
      status: stale ? 'STALE' : item.status,
      intent: item.intent,
      planId: item.publishingPlanId,
      planVersion: item.publishingPlan?.planVersion ?? null,
      planFingerprint: item.publishingPlan?.planFingerprint ?? null,
      mode: plan?.mode ?? 'BLOCKED',
      changeCount: plan?.changes.filter(({ operation }) => !['BLOCKED', 'NO_CHANGE'].includes(operation)).length ?? 0,
      blockers: plan?.blockers ?? (Array.isArray(item.blockers) ? item.blockers as string[] : []),
      warnings: plan?.warnings ?? [],
      changes: plan?.changes.map(({ fieldId, displayName, operation, risk, blockedReason }) => ({ fieldId, displayName, operation, risk, blockedReason })) ?? [],
      linkedProductGid: item.product.shopifyProductImportLink?.status === 'LINKED' ? item.product.shopifyProductImportLink.shopifyProductGid : null,
      reviewed: Boolean(item.reviewedAt),
      safeMessage: item.safeMessage,
      result: item.result,
    };
  });
  return {
    id: batch.id,
    project: { id: batch.projectId, name: batch.project.name },
    workspaceId: batch.workspaceId,
    status: deriveBatchStatus(items.map(({ status }) => status)),
    persistedStatus: batch.status,
    createdAt: batch.createdAt.toISOString(),
    completedAt: batch.completedAt?.toISOString() ?? null,
    items,
    summary: summarizeBulkResults(items.map(({ status }) => status)),
  };
}

async function updateItemFromPlan(batchId: string, productId: string, prepared: Awaited<ReturnType<typeof prepareSafePublishingPlan>>) {
  const blocked = prepared.plan.mode === 'BLOCKED' || prepared.plan.blockers.length > 0;
  await prisma.shopifyBulkPublishingItem.update({
    where: { batchId_productId: { batchId, productId } },
    data: {
      publishingPlanId: prepared.id,
      intent: prepared.plan.mode,
      status: blocked ? 'BLOCKED' : 'READY',
      blockers: [...prepared.plan.blockers] as Prisma.InputJsonValue,
      result: Prisma.DbNull,
      safeMessage: blocked ? prepared.plan.blockers[0] ?? 'This Product is not ready for Shopify.' : null,
      reviewedAt: null,
    },
  });
}

export async function prepareBulkPublishingBatch(userId: string, projectId: string, untrusted: unknown) {
  const input = bulkPrepareSchema.parse(untrusted);
  const access = await resolveProjectAccess(userId, projectId, input.workspaceId, true);
  const products = await prisma.product.findMany({
    where: { id: { in: input.products.map(({ productId }) => productId) }, projectId, workspaceId: input.workspaceId, archivedAt: null },
    select: { id: true, projectId: true, workspaceId: true },
  });
  try { assertAuthorizedProductSelection(input.products.map(({ productId }) => productId), products, projectId, input.workspaceId); }
  catch { throw new SafePublishingError('BULK_PRODUCT_SCOPE_INVALID', 404, 'One or more selected Products are unavailable.'); }

  const batch = await prisma.shopifyBulkPublishingBatch.create({
    data: {
      projectId, workspaceId: input.workspaceId, createdByUserId: userId,
      items: { create: buildBulkPublishingItemCreates(input.products, input.workspaceId) },
    },
  });
  await runWithConcurrency(input.products, 4, async ({ productId, intent }) => {
    try {
      const prepared = await prepareSafePublishingPlan(userId, productId, { intent }, projectId);
      await updateItemFromPlan(batch.id, productId, prepared);
    } catch (error) {
      await prisma.shopifyBulkPublishingItem.update({ where: { batchId_productId: { batchId: batch.id, productId } }, data: { status: 'BLOCKED', safeMessage: error instanceof SafePublishingError ? error.message.slice(0, 500) : 'This Product could not be prepared safely.' } });
    }
  });
  const loaded = await loadBatchRecord(userId, projectId, batch.id);
  const status = deriveBatchStatus(loaded.items.map(({ status }) => status));
  await prisma.$transaction([
    prisma.shopifyBulkPublishingBatch.update({ where: { id: batch.id }, data: { status } }),
    prisma.auditLog.create({ data: { organizationId: access.organizationId, workspaceId: input.workspaceId, userId, action: 'bulk_publish.prepared', entityType: 'ShopifyBulkPublishingBatch', entityId: batch.id, metadata: { projectId, productCount: input.products.length, readyCount: loaded.items.filter(({ status }) => status === 'READY').length, blockedCount: loaded.items.filter(({ status }) => status === 'BLOCKED').length } } }),
  ]);
  return batchDto(await loadBatchRecord(userId, projectId, batch.id));
}

export async function getBulkPublishingBatch(userId: string, projectId: string, batchId: string) {
  return batchDto(await loadBatchRecord(userId, projectId, batchId));
}

export async function updateBulkPublishingItem(userId: string, projectId: string, batchId: string, untrusted: unknown) {
  const input = bulkItemActionSchema.parse(untrusted);
  await resolveProjectAccess(userId, projectId, input.workspaceId, true);
  const batch = await loadBatchRecord(userId, projectId, batchId);
  const item = batch.items.find(({ productId }) => productId === input.productId);
  if (!item || item.workspaceId !== input.workspaceId) throw new SafePublishingError('BULK_PRODUCT_SCOPE_INVALID', 404, 'The selected Product is unavailable in this batch.');
  if (input.action === 'PREPARE_CREATE_NEW' || input.action === 'REPREPARE') {
    const intent = input.action === 'PREPARE_CREATE_NEW' ? 'CREATE_NEW' : item.product.shopifyProductImportLink ? 'REVIEW' : 'CREATE_NEW';
    const prepared = await prepareSafePublishingPlan(userId, item.productId, { intent }, projectId);
    await updateItemFromPlan(batchId, item.productId, prepared);
  } else {
    if (!item.publishingPlan || itemIsStale(item)) throw new SafePublishingError('PLAN_STALE', 409, 'Refresh this Product before approving it.');
    const plan = item.publishingPlan.payload as unknown as ShopifyPublishingPlanPayload;
    if (plan.mode === 'BLOCKED' || plan.blockers.length) throw new SafePublishingError('PLAN_BLOCKED', 409, 'Resolve this Product’s blockers before approval.');
    const selected = plan.changes.filter(({ operation }) => !['BLOCKED', 'NO_CHANGE'].includes(operation));
    const selection = {
      planId: item.publishingPlan.id,
      planVersion: item.publishingPlan.planVersion,
      planFingerprint: item.publishingPlan.planFingerprint,
      selectedFieldIds: selected.map(({ fieldId }) => fieldId),
      confirmations: [...selected.filter(({ risk }) => risk === 'HIGH').map(({ fieldId }) => fieldId), ...(plan.mode === 'CREATE_NEW' ? ['CREATE_NEW_PRODUCT'] : [])],
      duplicateCandidateReviewed: plan.duplicateAssessment.result === 'POSSIBLE_MATCH',
    };
    await saveSafePublishingReview(userId, item.productId, selection, projectId);
    await prisma.shopifyBulkPublishingItem.update({ where: { id: item.id }, data: { reviewedAt: new Date(), safeMessage: null } });
  }
  const refreshed = await loadBatchRecord(userId, projectId, batchId);
  await prisma.shopifyBulkPublishingBatch.update({
    where: { id: batchId },
    data: { status: deriveBatchStatus(refreshed.items.map(({ status }) => status)), completedAt: null },
  });
  return batchDto(await loadBatchRecord(userId, projectId, batchId));
}

export async function executeBulkPublishingBatch(userId: string, projectId: string, batchId: string, untrusted: unknown) {
  const input = bulkExecuteSchema.parse(untrusted);
  const access = await resolveProjectAccess(userId, projectId, input.workspaceId, true);
  let existing = await loadBatchRecord(userId, projectId, batchId);
  if (existing.completedAt) return batchDto(existing);
  if (existing.status !== 'EXECUTING') {
    if (!existing.items.some(({ status, reviewedAt }) => status === 'READY' && reviewedAt)) throw new SafePublishingError('NO_BULK_ITEMS_APPROVED', 409, 'Approve at least one ready Product before final confirmation.');
    const claimed = await prisma.shopifyBulkPublishingBatch.updateMany({ where: { id: batchId, projectId, workspaceId: input.workspaceId, status: { in: ['READY', 'PREPARING'] } }, data: { status: 'EXECUTING' } });
    if (claimed.count !== 1) throw new SafePublishingError('BULK_EXECUTION_ALREADY_STARTED', 409, 'This bulk publishing operation has already started.');
    await prisma.auditLog.create({ data: { organizationId: access.organizationId, workspaceId: input.workspaceId, userId, action: 'bulk_publish.started', entityType: 'ShopifyBulkPublishingBatch', entityId: batchId, metadata: { projectId, reviewedCount: existing.items.filter(({ reviewedAt }) => reviewedAt).length } } });
  }

  const abandonedBefore = new Date(Date.now() - 5 * 60 * 1000);
  await prisma.shopifyBulkPublishingItem.updateMany({
    where: { batchId, status: 'EXECUTING', updatedAt: { lt: abandonedBefore } },
    data: { status: 'PARTIAL', result: { code: 'UNCERTAIN_REMOTE_STATE' }, safeMessage: 'This Product may have changed in Shopify. Verify it before preparing a new plan.' },
  });
  existing = await loadBatchRecord(userId, projectId, batchId);
  const item = existing.items.find(({ status, reviewedAt, publishingPlan }) => status === 'READY' && Boolean(reviewedAt) && Boolean(publishingPlan));
  if (item?.publishingPlan) {
    const itemClaim = await prisma.shopifyBulkPublishingItem.updateMany({ where: { id: item.id, status: 'READY', reviewedAt: { not: null } }, data: { status: 'EXECUTING' } });
    if (itemClaim.count === 1) {
    try {
      const selection = item.publishingPlan.reviewSelection;
      const result = await executeSafePublishingPlan(userId, item.productId, selection, projectId);
      await prisma.shopifyBulkPublishingItem.update({ where: { id: item.id }, data: { status: 'COMPLETED', result: result as unknown as Prisma.InputJsonValue, safeMessage: 'Published and verified.' } });
    } catch (error) {
      const code = error instanceof SafePublishingError ? error.code : 'BULK_ITEM_FAILED';
      const status = code.includes('STALE') || code.includes('CHANGED') ? 'STALE' : code === 'UNCERTAIN_REMOTE_STATE' ? 'PARTIAL' : 'FAILED';
      await prisma.shopifyBulkPublishingItem.update({ where: { id: item.id }, data: { status, result: { code }, safeMessage: error instanceof SafePublishingError ? error.message.slice(0, 500) : 'This Product could not be published safely.' } });
    }
    }
  }
  const finalBatch = await loadBatchRecord(userId, projectId, batchId);
  if (finalBatch.items.some(({ status, reviewedAt }) => status === 'READY' && reviewedAt) || finalBatch.items.some(({ status }) => status === 'EXECUTING')) {
    return batchDto(finalBatch);
  }
  const finalStatus = deriveBatchStatus(finalBatch.items.map(({ status }) => status));
  const summary = summarizeBulkResults(finalBatch.items.map(({ status }) => status));
  const action = finalStatus === 'COMPLETED' ? 'bulk_publish.completed' : finalStatus === 'PARTIAL_SUCCESS' ? 'bulk_publish.partial' : 'bulk_publish.failed';
  await prisma.$transaction([
    prisma.shopifyBulkPublishingBatch.update({ where: { id: batchId }, data: { status: finalStatus, completedAt: new Date() } }),
    prisma.auditLog.create({ data: { organizationId: access.organizationId, workspaceId: input.workspaceId, userId, action, entityType: 'ShopifyBulkPublishingBatch', entityId: batchId, metadata: { projectId, ...summary } } }),
  ]);
  return batchDto(await loadBatchRecord(userId, projectId, batchId));
}
