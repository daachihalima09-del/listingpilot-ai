import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { ShopifyImportRepository } from '../catalog/import-repository';
import { ShopifyCatalogError } from '../catalog/catalog-errors';
import { legacyProductIdFromGid } from '../catalog/catalog-validation';
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
        status: true,
        shopifyProductGid: true,
        shopifyProductLegacyId: true,
        shopifyStoreId: true,
        project: {
          select: {
            id: true,
            workspaceId: true,
            archivedAt: true,
            shopifyProductPublication: { select: { shopifyProductId: true } },
          },
        },
      },
    });
    if (link) {
      const archived = Boolean(link.project.archivedAt);
      const valid = link.status === 'LINKED'
        && link.project.workspaceId === input.workspaceId
        && link.shopifyStoreId === input.shopifyStoreId
        && link.shopifyProductGid === input.productGid
        && link.shopifyProductLegacyId === legacyProductIdFromGid(input.productGid)
        && link.project.shopifyProductPublication?.shopifyProductId === link.shopifyProductLegacyId;
      return {
        projectId: link.project.id,
        archived,
        state: valid
          ? archived ? 'ARCHIVED_EXISTING_PROJECT' : 'VALID_EXISTING_LINK'
          : 'INCONSISTENT_LINK_BLOCKED',
      };
    }
    const conflictingStoreLink = await prisma.shopifyProductImportLink.findFirst({
      where: { workspaceId: input.workspaceId, shopifyProductGid: input.productGid },
      select: { projectId: true, project: { select: { archivedAt: true } } },
    });
    if (conflictingStoreLink) {
      return {
        projectId: conflictingStoreLink.projectId,
        archived: Boolean(conflictingStoreLink.project.archivedAt),
        state: 'INCONSISTENT_LINK_BLOCKED',
      };
    }
    const publication = await prisma.shopifyProductPublication.findUnique({
      where: {
        workspaceId_shopifyProductId: {
          workspaceId: input.workspaceId,
          shopifyProductId: legacyProductIdFromGid(input.productGid),
        },
      },
      select: { projectId: true, project: { select: { archivedAt: true, sourceType: true } } },
    });
    return publication ? {
      projectId: publication.projectId,
      archived: Boolean(publication.project.archivedAt),
      state: publication.project.sourceType ? 'LEGACY_RECOVERABLE_LINK' : 'INCONSISTENT_LINK_BLOCKED',
    } : null;
  },
  async repairLegacy(input) {
    const product = input.snapshot.product;
    if (
      product.id !== `gid://shopify/Product/${product.legacyResourceId}`
      || legacyProductIdFromGid(product.id) !== product.legacyResourceId
    ) {
      throw new ShopifyCatalogError('LINK_INCONSISTENT', 409, 'The Shopify product identity could not be verified. No changes were made.');
    }
    try {
      return await prisma.$transaction(async (transaction) => {
        const [store, publication, competingProductLink] = await Promise.all([
          transaction.shopifyStore.findFirst({
            where: { id: input.shopifyStoreId, workspaceId: input.workspaceId, status: { in: ['CONNECTED', 'ACTIVE'] } },
            select: { id: true },
          }),
          transaction.shopifyProductPublication.findUnique({
            where: { workspaceId_shopifyProductId: { workspaceId: input.workspaceId, shopifyProductId: product.legacyResourceId } },
            select: {
              projectId: true,
              workspaceId: true,
              shopifyProductId: true,
              project: { select: { archivedAt: true, sourceType: true, shopifyProductImportLink: { select: { id: true, shopifyStoreId: true, shopifyProductGid: true, shopifyProductLegacyId: true, status: true } } } },
            },
          }),
          transaction.shopifyProductImportLink.findFirst({
            where: { workspaceId: input.workspaceId, shopifyProductGid: product.id },
            select: { projectId: true, shopifyStoreId: true, status: true },
          }),
        ]);
        if (
          !store
          || !publication
          || publication.workspaceId !== input.workspaceId
          || publication.shopifyProductId !== product.legacyResourceId
          || !publication.project.sourceType
          || (competingProductLink && competingProductLink.projectId !== publication.projectId)
        ) throw new ShopifyCatalogError('LINK_INCONSISTENT', 409, 'The legacy ListingPilot link could not be verified. No changes were made.');
        const currentLink = publication.project.shopifyProductImportLink;
        if (currentLink) {
          const valid = currentLink.status === 'LINKED'
            && currentLink.shopifyStoreId === input.shopifyStoreId
            && currentLink.shopifyProductGid === product.id
            && currentLink.shopifyProductLegacyId === product.legacyResourceId;
          if (!valid) throw new ShopifyCatalogError('LINK_INCONSISTENT', 409, 'The existing ListingPilot link conflicts with this Shopify product. No changes were made.');
          return {
            projectId: publication.projectId,
            archived: Boolean(publication.project.archivedAt),
            state: publication.project.archivedAt ? 'ARCHIVED_EXISTING_PROJECT' as const : 'VALID_EXISTING_LINK' as const,
          };
        }
        await transaction.shopifyProductImportLink.create({
          data: {
            projectId: publication.projectId,
            workspaceId: input.workspaceId,
            shopifyStoreId: input.shopifyStoreId,
            shopifyProductGid: product.id,
            shopifyProductLegacyId: product.legacyResourceId,
            productHandle: product.handle,
            status: 'LINKED',
            sourceSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
            shopifyUpdatedAtAtImport: new Date(product.updatedAt),
            importedAt: input.repairedAt,
            lastSourceReadAt: input.repairedAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: input.organizationId,
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
            action: 'shopify.product_linkage_repaired',
            entityType: 'Project',
            entityId: publication.projectId,
            metadata: {
              shopifyStoreId: input.shopifyStoreId,
              shopifyProductGid: product.id,
              repairCategory: 'LEGACY_PUBLICATION_WITHOUT_IMPORT_LINK',
              previousLinkState: 'MISSING',
              resultingLinkState: 'LINKED',
            },
          },
        });
        return {
          projectId: publication.projectId,
          archived: Boolean(publication.project.archivedAt),
          state: 'RECOVERABLE_LINK_REPAIRED' as const,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (error instanceof ShopifyCatalogError) throw error;
      const winner = await prismaShopifyImportRepository.findExisting({
        workspaceId: input.workspaceId,
        shopifyStoreId: input.shopifyStoreId,
        productGid: product.id,
      });
      if (winner && ['VALID_EXISTING_LINK', 'ARCHIVED_EXISTING_PROJECT'].includes(winner.state)) return winner;
      throw error;
    }
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
      return { projectId: project.id, archived: false, state: 'VALID_EXISTING_LINK' };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 15_000,
    });
  },
};
