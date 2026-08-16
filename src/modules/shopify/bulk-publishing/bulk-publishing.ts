import { z } from 'zod';

export const bulkPrepareSchema = z.object({
  workspaceId: z.string().uuid(),
  products: z.array(z.object({
    productId: z.string().uuid(),
    intent: z.enum(['REVIEW', 'CREATE_NEW']),
  }).strict()).min(1).max(50),
}).strict().superRefine(({ products }, context) => {
  if (new Set(products.map(({ productId }) => productId)).size !== products.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['products'], message: 'Products must be unique.' });
  }
});

export const bulkItemActionSchema = z.object({
  workspaceId: z.string().uuid(),
  productId: z.string().uuid(),
  action: z.enum(['PREPARE_CREATE_NEW', 'REPREPARE', 'APPROVE']),
}).strict();

export const bulkExecuteSchema = z.object({
  workspaceId: z.string().uuid(),
  confirmed: z.literal(true),
}).strict();

export type BulkProductReadiness =
  | 'READY'
  | 'NEEDS_REVIEW'
  | 'BLOCKED'
  | 'NOT_GENERATED'
  | 'NOT_SAVED'
  | 'ALREADY_LINKED'
  | 'PUBLISHING_PLAN_STALE';

export function classifyBulkProduct(input: {
  hasAnalysis: boolean;
  hasListing: boolean;
  listingStatus: string | null;
  reviewedSectionCount: number;
  isShopifyLinked: boolean;
  hasStalePlan: boolean;
}): BulkProductReadiness {
  if (!input.hasAnalysis) return 'BLOCKED';
  if (!input.hasListing) return 'NOT_GENERATED';
  if (input.listingStatus !== 'SAVED') return 'NOT_SAVED';
  if (input.reviewedSectionCount < 6) return 'NEEDS_REVIEW';
  if (input.hasStalePlan) return 'PUBLISHING_PLAN_STALE';
  return input.isShopifyLinked ? 'ALREADY_LINKED' : 'READY';
}

export function summarizeBulkResults(statuses: readonly string[]) {
  const succeeded = statuses.filter((status) => status === 'COMPLETED').length;
  const failed = statuses.filter((status) => ['FAILED', 'PARTIAL', 'STALE', 'BLOCKED'].includes(status)).length;
  const pending = statuses.length - succeeded - failed;
  return { total: statuses.length, succeeded, failed, pending };
}

export function deriveBatchStatus(statuses: readonly string[]) {
  if (statuses.some((status) => status === 'EXECUTING')) return 'EXECUTING' as const;
  if (statuses.every((status) => status === 'COMPLETED')) return 'COMPLETED' as const;
  if (statuses.some((status) => status === 'COMPLETED') && !statuses.every((status) => status === 'COMPLETED')) return 'PARTIAL_SUCCESS' as const;
  if (statuses.length > 0 && statuses.every((status) => ['FAILED', 'PARTIAL', 'STALE', 'BLOCKED'].includes(status))) return 'FAILED' as const;
  return 'READY' as const;
}

export function assertAuthorizedProductSelection(
  requestedIds: readonly string[],
  authorized: readonly { id: string; projectId: string; workspaceId: string }[],
  projectId: string,
  workspaceId: string,
): void {
  const allowed = new Set(authorized.filter((product) => product.projectId === projectId && product.workspaceId === workspaceId).map(({ id }) => id));
  if (requestedIds.some((id) => !allowed.has(id))) throw new Error('BULK_PRODUCT_SCOPE_INVALID');
}

export function buildBulkPublishingItemCreates(
  products: readonly { productId: string; intent: 'REVIEW' | 'CREATE_NEW' }[],
  workspaceId: string,
) {
  return products.map(({ productId, intent }) => ({
    intent: intent === 'CREATE_NEW' ? 'CREATE_NEW' as const : 'BLOCKED' as const,
    product: {
      connect: {
        id_workspaceId: { id: productId, workspaceId },
      },
    },
  }));
}

export function isBulkPlanFresh(input: {
  status: string;
  expiresAt: Date;
  now: Date;
  productVersion: number;
  planProductVersion: number;
  currentDraftFingerprint: string | null;
  planDraftFingerprint: string;
}): boolean {
  return input.status === 'OPEN'
    && input.expiresAt > input.now
    && input.productVersion === input.planProductVersion
    && input.currentDraftFingerprint === input.planDraftFingerprint;
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  operation: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      if (item !== undefined) await operation(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
}
