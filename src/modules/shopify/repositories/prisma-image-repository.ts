import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  SHOPIFY_IMAGE_LIMITS,
  type ShopifyImageMimeType,
} from '../images/image-limits';
import type {
  ImageUploadSession,
  PersistedImageConfiguration,
  PersistedShopifyImage,
  ShopifyImageRepository,
} from '../images/image-repository';
import { opaqueProjectReference } from '../metafields/metafield-mapping';

const configurationInclude = {
  images: { orderBy: { position: 'asc' as const } },
};

function parseStatus(status: string): PersistedShopifyImage['status'] {
  if ([
    'CONFIGURED',
    'UPLOADING',
    'PROCESSING',
    'READY',
    'FAILED',
    'MISSING_REMOTE',
    'INACTIVE',
  ].includes(status)) return status as PersistedShopifyImage['status'];
  throw new Error('Unsupported stored image status.');
}

function parseMimeType(value: string): ShopifyImageMimeType {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(value)) {
    return value as ShopifyImageMimeType;
  }
  throw new Error('Unsupported stored image MIME type.');
}

function parseConfiguration(record: {
  id: string;
  version: number;
  images: Array<{
    id: string;
    sourceType: 'REMOTE_URL' | 'LOCAL_UPLOAD';
    sourceUrl: string | null;
    originalFilename: string | null;
    mimeType: string;
    byteSize: number;
    contentHash: string;
    altText: string | null;
    position: number;
    isPrimary: boolean;
    active: boolean;
    status: string;
    shopifyMediaId: string | null;
    shopifyFileId: string | null;
    shopifyImageUrl: string | null;
    firstPublishedAt: Date | null;
    lastPublishedAt: Date | null;
    lastErrorCategory: string | null;
    width: number | null;
    height: number | null;
    sourceProvenance: string | null;
    sourcePageUrl: string | null;
  }>;
}): PersistedImageConfiguration {
  return {
    id: record.id,
    version: record.version,
    images: record.images.map((image) => ({
      id: image.id,
      sourceType: image.sourceType,
      sourceUrl: image.sourceUrl,
      originalFilename: image.originalFilename,
      mimeType: parseMimeType(image.mimeType),
      byteSize: image.byteSize,
      contentHash: image.contentHash,
      altText: image.altText,
      position: image.position,
      isPrimary: image.isPrimary,
      active: image.active,
      status: parseStatus(image.status),
      shopifyMediaId: image.shopifyMediaId,
      shopifyFileId: image.shopifyFileId,
      shopifyImageUrl: image.shopifyImageUrl,
      firstPublishedAt: image.firstPublishedAt,
      lastPublishedAt: image.lastPublishedAt,
      lastErrorCategory: image.lastErrorCategory,
      width: image.width,
      height: image.height,
      sourceProvenance: image.sourceProvenance,
      sourcePageUrl: image.sourcePageUrl,
    })),
  };
}

function parseUploadSession(record: {
  id: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  productId?: string | null;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  altText: string | null;
  status: 'PENDING' | 'PROCESSING' | 'CONSUMED';
  expiresAt: Date;
}): ImageUploadSession {
  return {
    id: record.id,
    actorUserId: record.userId,
    workspaceId: record.workspaceId,
    projectId: record.productId ?? record.projectId,
    filename: record.originalFilename,
    mimeType: parseMimeType(record.mimeType),
    byteSize: record.byteSize,
    altText: record.altText,
    status: record.status,
    expiresAt: record.expiresAt,
  };
}

export const prismaShopifyImageRepository: ShopifyImageRepository = {
  async resolveProject(actorUserId, projectId) {
    const project = await prisma.product.findFirst({
      where: {
        id: projectId,
        workspace: {
          organization: {
            memberships: { some: { userId: actorUserId } },
          },
        },
      },
      select: {
        id: true,
        workspaceId: true,
        archivedAt: true,
        workspace: {
          select: {
            organizationId: true,
            organization: {
              select: {
                memberships: {
                  where: { userId: actorUserId },
                  take: 1,
                  select: { role: true },
                },
              },
            },
            shopifyStores: {
              where: {
                status: { in: ['CONNECTED', 'ACTIVE'] },
                accessTokenEncrypted: { not: null },
              },
              take: 1,
              select: { id: true, grantedScopes: true },
            },
          },
        },
        shopifyProductPublication: {
          select: { shopifyProductId: true },
        },
        shopifyImageConfiguration: {
          include: configurationInclude,
        },
      },
    });
    const membership = project?.workspace.organization.memberships[0];
    if (!project || !membership) return null;
    const store = project.workspace.shopifyStores[0];
    return {
      actorUserId,
      organizationId: project.workspace.organizationId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      role: membership.role,
      archived: Boolean(project.archivedAt),
      shopifyStoreId: store?.id ?? null,
      grantedScopes: store?.grantedScopes ?? [],
      shopifyProductId:
        project.shopifyProductPublication?.shopifyProductId ?? null,
      configuration: project.shopifyImageConfiguration
        ? parseConfiguration(project.shopifyImageConfiguration)
        : null,
    };
  },

  async saveConfiguration(input) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.shopifyImageConfiguration.findFirst({
        where: {
          workspaceId: input.context.workspaceId,
          productId: input.context.projectId,
        },
        include: { images: true },
      });
      if (!existing || existing.version !== input.version) return false;
      const requestedIds = new Set(input.images.map(({ localId }) => localId));
      if (input.images.some(({ localId }) => (
        !existing.images.some(({ id }) => id === localId)
      ))) return false;
      await transaction.shopifyProjectImage.updateMany({
        where: { configurationId: existing.id },
        data: { position: { increment: SHOPIFY_IMAGE_LIMITS.maximumImages + 1 } },
      });
      for (const image of input.images) {
        await transaction.shopifyProjectImage.update({
          where: { id: image.localId },
          data: {
            altText: image.altText,
            position: image.position,
            isPrimary: image.isPrimary,
            active: image.active,
            ...(image.active ? {} : { status: 'INACTIVE' }),
          },
        });
      }
      const omitted = existing.images.filter(({ id }) => !requestedIds.has(id));
      if (omitted.length) {
        await transaction.shopifyProjectImage.updateMany({
          where: { id: { in: omitted.map(({ id }) => id) } },
          data: {
            active: false,
            isPrimary: false,
            status: 'INACTIVE',
          },
        });
      }
      await transaction.shopifyImageConfiguration.update({
        where: { id: existing.id },
        data: { version: { increment: 1 } },
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.context.organizationId,
          workspaceId: input.context.workspaceId,
          userId: input.context.actorUserId,
          action: 'product.images_configuration_updated',
          entityType: 'Product',
          entityId: input.context.projectId,
          metadata: { managedCount: input.images.length, removedCount: omitted.length },
        },
      });
      return true;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 20_000,
    });
  },

  async createImage(input) {
    return prisma.$transaction(async (transaction) => {
      const owner = await transaction.product.findFirstOrThrow({
        where: { id: input.context.projectId, workspaceId: input.context.workspaceId },
        select: { projectId: true },
      });
      let configuration = await transaction.shopifyImageConfiguration.findFirst({
        where: {
          workspaceId: input.context.workspaceId,
          productId: input.context.projectId,
        },
        include: { images: true },
      });
      const active = configuration?.images.filter(({ active }) => active) ?? [];
      if (active.length >= SHOPIFY_IMAGE_LIMITS.maximumImages) {
        throw new Error('IMAGE_COUNT_LIMIT');
      }
      if (
        active.reduce((sum, image) => sum + image.byteSize, 0) + input.byteSize
        > SHOPIFY_IMAGE_LIMITS.maximumTotalBytes
      ) throw new Error('IMAGE_TOTAL_SIZE_LIMIT');
      const duplicate = configuration?.images.find(
        ({ contentHash }) => contentHash === input.contentHash,
      );
      if (duplicate) {
        if (duplicate.status === 'FAILED' && !duplicate.shopifyFileId) {
          await transaction.shopifyProjectImage.update({
            where: { id: duplicate.id },
            data: {
              sourceType: input.sourceType,
              sourceUrl: input.sourceUrl,
              originalFilename: input.originalFilename,
              mimeType: input.mimeType,
              byteSize: input.byteSize,
              altText: input.altText,
              width: input.width,
              height: input.height,
              sourceProvenance: input.sourceProvenance ?? null,
              sourcePageUrl: input.sourcePageUrl ?? null,
              active: true,
              status: 'UPLOADING',
              lastErrorCategory: null,
            },
          });
          return duplicate.id;
        }
        throw new Error('DUPLICATE_IMAGE');
      }
      if (!configuration) {
        configuration = await transaction.shopifyImageConfiguration.create({
          data: {
            workspaceId: input.context.workspaceId,
            projectId: owner.projectId,
            productId: input.context.projectId,
          },
          include: { images: true },
        });
      } else {
        await transaction.shopifyImageConfiguration.update({
          where: { id: configuration.id },
          data: { version: { increment: 1 } },
        });
      }
      const image = await transaction.shopifyProjectImage.create({
        data: {
          configurationId: configuration.id,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          contentHash: input.contentHash,
          altText: input.altText,
          width: input.width,
          height: input.height,
          sourceProvenance: input.sourceProvenance ?? null,
          sourcePageUrl: input.sourcePageUrl ?? null,
          position: active.length,
          isPrimary: active.length === 0,
          status: input.initialStatus ?? 'UPLOADING',
        },
      });
      if (input.sourceImageId) {
        const linked = await transaction.productSourceImage.updateMany({
          where: {
            id: input.sourceImageId,
            workspaceId: input.context.workspaceId,
            projectId: owner.projectId,
            productId: input.context.projectId,
            status: 'DETECTED',
            importedImageId: null,
          },
          data: { status: 'IMPORTED', importedImageId: image.id },
        });
        if (linked.count !== 1) throw new Error('SOURCE_IMAGE_LINK_FAILED');
      }
      return image.id;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 20_000,
    });
  },

  async persistCreatedFile(input) {
    const result = await prisma.shopifyProjectImage.updateMany({
      where: {
        id: input.localImageId,
        configuration: {
          productId: input.context.projectId,
          workspaceId: input.context.workspaceId,
        },
      },
      data: {
        shopifyFileId: input.shopifyFileId,
        status: input.status,
        shopifyImageUrl: input.imageUrl,
        lastErrorCategory: null,
      },
    });
    if (result.count !== 1) throw new Error('Image file linkage was not saved.');
  },

  async updateImageState(input) {
    const current = input.publishedAt
      ? await prisma.shopifyProjectImage.findFirst({
          where: {
            id: input.localImageId,
            configuration: {
              productId: input.context.projectId,
              workspaceId: input.context.workspaceId,
            },
          },
          select: { firstPublishedAt: true },
        })
      : null;
    const result = await prisma.shopifyProjectImage.updateMany({
      where: {
        id: input.localImageId,
        configuration: {
          productId: input.context.projectId,
          workspaceId: input.context.workspaceId,
        },
      },
      data: {
        status: input.status,
        ...(input.shopifyMediaId !== undefined
          ? { shopifyMediaId: input.shopifyMediaId }
          : {}),
        ...(input.shopifyImageUrl !== undefined
          ? { shopifyImageUrl: input.shopifyImageUrl }
          : {}),
        ...(input.errorCategory !== undefined
          ? { lastErrorCategory: input.errorCategory }
          : {}),
        ...(input.publishedAt
          ? {
              firstPublishedAt: current?.firstPublishedAt ?? input.publishedAt,
              lastPublishedAt: input.publishedAt,
            }
          : {}),
      },
    });
    if (result.count !== 1) throw new Error('Image state was not saved.');
  },

  async createUploadSession(input) {
    const owner = await prisma.product.findUniqueOrThrow({ where: { id: input.context.projectId }, select: { projectId: true } });
    return parseUploadSession(await prisma.shopifyImageUploadSession.create({
      data: {
        projectId: owner.projectId,
        productId: input.context.projectId,
        workspaceId: input.context.workspaceId,
        userId: input.context.actorUserId,
        originalFilename: input.filename,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        altText: input.altText,
        expiresAt: input.expiresAt,
      },
    }));
  },

  async claimUploadSession(input) {
    const claimed = await prisma.shopifyImageUploadSession.updateMany({
      where: {
        id: input.uploadId,
        userId: input.actorUserId,
        workspaceId: input.workspaceId,
        productId: input.projectId,
        status: 'PENDING',
        expiresAt: { gt: input.now },
      },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count !== 1) return null;
    const session = await prisma.shopifyImageUploadSession.findUnique({
      where: { id: input.uploadId },
    });
    return session ? parseUploadSession(session) : null;
  },

  async releaseUploadSession(uploadId) {
    await prisma.shopifyImageUploadSession.updateMany({
      where: { id: uploadId, status: 'PROCESSING', expiresAt: { gt: new Date() } },
      data: { status: 'PENDING' },
    });
  },

  async consumeUploadSession(uploadId, consumedAt) {
    const result = await prisma.shopifyImageUploadSession.updateMany({
      where: { id: uploadId, status: 'PROCESSING' },
      data: { status: 'CONSUMED', consumedAt },
    });
    if (result.count !== 1) throw new Error('Upload session was not consumed.');
  },

  async createAudit(input) {
    if (!input.context.shopifyProductId) {
      throw new Error('A linked Shopify product is required for image audit.');
    }
    await prisma.auditLog.create({
      data: {
        organizationId: input.context.organizationId,
        workspaceId: input.context.workspaceId,
        userId: input.context.actorUserId,
        action: input.action,
        entityType: 'ShopifyProduct',
        entityId: input.context.shopifyProductId,
        metadata: {
          projectReference: opaqueProjectReference(input.context.projectId),
          shopifyProductId: input.context.shopifyProductId,
          localImageIds: input.metadata.localImageIds,
          created: input.metadata.created,
          updated: input.metadata.updated,
          unchanged: input.metadata.unchanged,
          pending: input.metadata.pending,
          failed: input.metadata.failed,
          batchCount: input.metadata.batchCount,
          ...(input.metadata.failureCategory
            ? { failureCategory: input.metadata.failureCategory }
            : {}),
        },
      },
    });
  },
};
