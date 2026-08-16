import 'server-only';

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { shopifyProductSnapshotSchema } from '../catalog/snapshot';
import type { ShopifyChangeReviewPayload } from './review-types';
import { ShopifyReviewError } from './review-errors';

export async function resolveReviewProject(userId: string, projectId: string) {
  const project = await prisma.product.findFirst({
    where: {
      id: projectId,
      archivedAt: null,
      workspace: {
        organization: { memberships: { some: { userId } } },
      },
    },
    select: {
      id: true,
      projectId: true,
      workspaceId: true,
      version: true,
      generatedListing: true,
      seoData: true,
      shopifyVariantConfiguration: {
        select: {
          variants: {
            select: {
              id: true,
              shopifyVariantId: true,
              optionValues: true,
              price: true,
              compareAtPrice: true,
              sku: true,
              barcode: true,
              position: true,
              active: true,
            },
          },
        },
      },
      shopifyMetafieldConfiguration: {
        select: {
          metafields: {
            select: {
              namespace: true,
              key: true,
              type: true,
              serializedValue: true,
              enabled: true,
            },
          },
        },
      },
      shopifyImageConfiguration: {
        select: {
          images: {
            select: {
              id: true,
              shopifyMediaId: true,
              altText: true,
              position: true,
              active: true,
            },
          },
        },
      },
      workspace: {
        select: {
          organizationId: true,
          organization: {
            select: {
              memberships: {
                where: { userId },
                take: 1,
                select: { role: true },
              },
            },
          },
        },
      },
      shopifyProductPublication: {
        select: { shopifyProductId: true },
      },
      shopifyProductImportLink: {
        select: {
          id: true,
          status: true,
          shopifyStoreId: true,
          shopifyProductGid: true,
          shopifyProductLegacyId: true,
          sourceSnapshot: true,
          importedAt: true,
          shopifyStore: {
            select: {
              id: true,
              workspaceId: true,
              status: true,
              accessTokenEncrypted: true,
              shopDomain: true,
              shopName: true,
            },
          },
        },
      },
    },
  });
  const membership = project?.workspace.organization.memberships[0];
  if (!project || !membership) {
    throw new ShopifyReviewError('WORKSPACE_FORBIDDEN', 404, 'The requested review is unavailable.');
  }
  const link = project.shopifyProductImportLink;
  if (!link) {
    throw new ShopifyReviewError('IMPORT_LINK_REQUIRED', 409, 'A Shopify import link is required.');
  }
  if (
    link.status !== 'LINKED'
    || link.shopifyStore.workspaceId !== project.workspaceId
    || project.shopifyProductPublication?.shopifyProductId !== link.shopifyProductLegacyId
  ) {
    throw new ShopifyReviewError('LINK_INCONSISTENT', 409, 'The Shopify product link is inconsistent.');
  }
  if (
    !['CONNECTED', 'ACTIVE'].includes(link.shopifyStore.status)
    || !link.shopifyStore.accessTokenEncrypted
  ) {
    throw new ShopifyReviewError('REVIEW_STALE', 409, 'The Shopify connection is unavailable.');
  }
  return {
    actorUserId: userId,
    organizationId: project.workspace.organizationId,
    role: membership.role,
    projectId: project.id,
    containerProjectId: project.projectId,
    workspaceId: project.workspaceId,
    projectVersion: project.version,
    generatedListing: project.generatedListing,
    seoData: project.seoData,
    shopifyVariantConfiguration: project.shopifyVariantConfiguration,
    shopifyMetafieldConfiguration: project.shopifyMetafieldConfiguration,
    shopifyImageConfiguration: project.shopifyImageConfiguration,
    linkId: link.id,
    shopifyStoreId: link.shopifyStoreId,
    shopifyProductGid: link.shopifyProductGid,
    baseline: shopifyProductSnapshotSchema.parse(link.sourceSnapshot),
    importedAt: link.importedAt,
    store: link.shopifyStore,
  };
}

export function hashReviewBaseline(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function createReviewRecord(input: {
  context: Awaited<ReturnType<typeof resolveReviewProject>>;
  comparison: ShopifyChangeReviewPayload;
  remoteFingerprint: string;
  generatedAt: Date;
}) {
  if (Buffer.byteLength(JSON.stringify(input.comparison)) > 512 * 1024) {
    throw new ShopifyReviewError('SELECTIVE_PUBLISH_FAILED', 500, 'The comparison is too large.');
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.shopifyChangeReview.updateMany({
      where: {
        productId: input.context.projectId,
        workspaceId: input.context.workspaceId,
        status: 'OPEN',
      },
      data: { status: 'STALE' },
    });
    const review = await transaction.shopifyChangeReview.create({
      data: {
        projectId: input.context.containerProjectId,
        productId: input.context.projectId,
        workspaceId: input.context.workspaceId,
        shopifyStoreId: input.context.shopifyStoreId,
        createdByUserId: input.context.actorUserId,
        shopifyProductGid: input.context.shopifyProductGid,
        comparisonJson: input.comparison as unknown as Prisma.InputJsonValue,
        decisionsJson: {},
        baselineUpdatedAt: new Date(input.comparison.baselineShopifyUpdatedAt),
        remoteUpdatedAt: new Date(input.comparison.remoteShopifyUpdatedAt),
        remoteFingerprint: input.remoteFingerprint,
        projectVersion: input.context.projectVersion,
        baselineSnapshotHash: hashReviewBaseline(input.context.baseline),
        generatedAt: input.generatedAt,
        expiresAt: new Date(input.generatedAt.getTime() + 30 * 60 * 1000),
      },
    });
    await transaction.auditLog.create({
      data: {
        organizationId: input.context.organizationId,
        workspaceId: input.context.workspaceId,
        userId: input.context.actorUserId,
        action: 'shopify.change_review_generated',
        entityType: 'ShopifyChangeReview',
        entityId: review.id,
        metadata: {
          projectId: input.context.projectId,
          conflicts: input.comparison.summary.conflicts,
          blocked: input.comparison.summary.blocked,
          reviewVersion: review.version,
        },
      },
    });
    return review;
  });
}

export async function findAuthorizedReview(
  userId: string,
  projectId: string,
  reviewId: string,
) {
  const review = await prisma.shopifyChangeReview.findFirst({
    where: {
      id: reviewId,
      productId: projectId,
      product: {
        workspace: {
          organization: { memberships: { some: { userId } } },
        },
      },
    },
  });
  if (!review) throw new ShopifyReviewError('REVIEW_NOT_FOUND', 404, 'The review is unavailable.');
  return review;
}
