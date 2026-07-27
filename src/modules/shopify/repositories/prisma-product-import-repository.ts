import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ShopifyImportRepository } from '../catalog/import-repository';
import { stripExternalHtml } from '../catalog/snapshot';

export const prismaShopifyImportRepository: ShopifyImportRepository = {
  async findExisting(input) {
    const link = await prisma.shopifyProductImportLink.findUnique({
      where: {
        workspaceId_shopifyStoreId_shopifyProductGid: {
          workspaceId: input.workspaceId,
          shopifyStoreId: input.shopifyStoreId,
          shopifyProductGid: input.productGid,
        },
      },
      select: {
        project: { select: { id: true, archivedAt: true } },
      },
    });
    return link
      ? { projectId: link.project.id, archived: Boolean(link.project.archivedAt) }
      : null;
  },
  async create(input) {
    const product = input.snapshot.product;
    return prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          workspaceId: input.workspaceId,
          name: product.title.slice(0, 200),
          status: 'DRAFT',
          sourceType: 'SHOPIFY_IMPORT',
          sourceUrl: `https://${input.shopDomain}/products/${product.handle}`,
          rawInput: stripExternalHtml(product.descriptionHtml).slice(0, 100_000),
          generatedListing: {
            title: product.title,
            description: stripExternalHtml(product.descriptionHtml),
            keyFeatures: '',
          },
          seoData: {
            seoTitle: product.seo.title ?? '',
            seoDescription: product.seo.description ?? '',
            tags: product.tags.join(', '),
          },
          readinessData: {
            analysisStarted: false,
            activeStage: 'input',
            completedStages: [],
            shopifyReady: false,
          },
        },
        select: { id: true, archivedAt: true },
      });
      await transaction.shopifyProductImportLink.create({
        data: {
          projectId: project.id,
          workspaceId: input.workspaceId,
          shopifyStoreId: input.shopifyStoreId,
          shopifyProductGid: product.id,
          shopifyProductLegacyId: product.legacyResourceId,
          productHandle: product.handle,
          status: 'LINKED',
          sourceSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
          shopifyUpdatedAtAtImport: new Date(product.updatedAt),
          importedAt: input.importedAt,
          lastSourceReadAt: input.importedAt,
        },
      });
      await transaction.shopifyProductPublication.create({
        data: {
          projectId: project.id,
          workspaceId: input.workspaceId,
          shopifyProductId: product.legacyResourceId,
          shopifyHandle: product.handle,
          shopifyTitle: product.title,
          lastStatus: product.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
          firstPublishedAt: input.importedAt,
          lastPublishedAt: input.importedAt,
        },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          action: 'shopify.product_import_completed',
          entityType: 'Project',
          entityId: project.id,
          metadata: {
            shopifyStoreId: input.shopifyStoreId,
            productReference: product.legacyResourceId,
            variantCount: product.variants.length,
            mediaCount: product.media.length,
            outcome: 'CREATED',
          },
        },
      });
      return { projectId: project.id, archived: false };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 15_000,
    });
  },
};
