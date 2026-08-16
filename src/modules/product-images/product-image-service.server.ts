import 'server-only';

import { prisma } from '@/lib/prisma';
import { extractProductPage, ProductPageExtractionError } from '@/lib/product-page-extractor';
import { addUserManagedRemoteImage, getUserShopifyImages } from '@/modules/shopify/images/image-operations.server';
import { ShopifyImageError } from '@/modules/shopify/images/image-errors';
import { imageQuality } from '@/modules/shopify/images/image-validation';
import type { DetectedSourceImage } from './source-image-detection';
import { persistCandidatesIndependently } from './candidate-persistence';
import {
  identityFromImportInput,
  importSourceImagesSchema,
  productImageIdentitySchema,
  type ProductImageIdentity as Identity,
} from './product-image-import-contract';

export { importSourceImagesSchema } from './product-image-import-contract';

export class ProductImagePersistenceError extends Error {
  readonly code = 'PRODUCT_IMAGE_PERSISTENCE_FAILED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProductImagePersistenceError';
  }
}

function safePersistenceDiagnostic(error: unknown) {
  const value = error as { name?: string; code?: string; meta?: { modelName?: string; target?: unknown; field_name?: string } };
  return {
    errorClass: value?.name ?? (error instanceof Error ? error.name : 'UnknownError'),
    errorCode: value?.code ?? null,
    modelName: value?.meta?.modelName ?? null,
    target: value?.meta?.target ?? null,
    field: value?.meta?.field_name ?? null,
    stalePrismaClient: !prisma.productSourceImage,
  };
}

async function authorize(userId: string, identity: Identity, ownerRequired: boolean) {
  const parsed = productImageIdentitySchema.parse(identity);
  const product = await prisma.product.findFirst({
    where: {
      id: parsed.productId,
      projectId: parsed.projectId,
      workspaceId: parsed.workspaceId,
      archivedAt: null,
      workspace: { organization: { memberships: { some: { userId } } } },
    },
    select: {
      id: true,
      projectId: true,
      workspaceId: true,
      sourceUrl: true,
      workspace: { select: { organizationId: true, organization: { select: { memberships: { where: { userId }, take: 1, select: { role: true } } } } } },
    },
  });
  const role = product?.workspace.organization.memberships[0]?.role;
  if (!product || !role) throw new ShopifyImageError('SHOPIFY_IMAGE_PROJECT_NOT_FOUND', 'The Product images are unavailable.', 404);
  if (ownerRequired && role !== 'OWNER') throw new ShopifyImageError('SHOPIFY_IMAGE_FORBIDDEN', 'Only the workspace owner can manage Product images.', 403);
  return { ...product, organizationId: product.workspace.organizationId };
}

function sourceDto(source: {
  id: string; sourceKind: string; width: number | null; height: number | null;
  altText: string | null; status: string; score: number;
}) {
  const quality = imageQuality({ width: source.width, height: source.height, byteSize: 0 });
  return {
    id: source.id,
    sourceKind: source.sourceKind,
    width: source.width,
    height: source.height,
    altText: source.altText,
    status: source.status,
    score: source.score,
    quality: quality.status,
    qualityWarning: quality.warning,
    previewUrl: `/api/product-images/sources/${source.id}/preview`,
  };
}

export async function persistDetectedProductImages(
  userId: string,
  identity: Identity,
  sourcePageUrl: string,
  candidates: readonly DetectedSourceImage[],
) {
  const product = await authorize(userId, identity, true);
  const now = new Date();
  const result = await persistCandidatesIndependently(candidates, async (candidate) => {
      await prisma.productSourceImage.upsert({
        where: { productId_workspaceId_urlHash: { productId: product.id, workspaceId: product.workspaceId, urlHash: candidate.urlHash } },
        create: {
          workspaceId: product.workspaceId,
          projectId: product.projectId,
          productId: product.id,
          sourcePageUrl,
          imageUrl: candidate.url,
          urlHash: candidate.urlHash,
          sourceKind: candidate.sourceKind,
          width: candidate.width,
          height: candidate.height,
          altText: candidate.altText,
          score: candidate.score,
          lastDetectedAt: now,
        },
        update: {
          sourcePageUrl,
          imageUrl: candidate.url,
          sourceKind: candidate.sourceKind,
          width: candidate.width,
          height: candidate.height,
          altText: candidate.altText,
          score: candidate.score,
          lastDetectedAt: now,
        },
      });
    }, ({ candidate, error }) => {
      console.error('Product source image candidate persistence failed', {
        stage: 'product_source_image_upsert',
        workspaceId: product.workspaceId,
        projectId: product.projectId,
        productId: product.id,
        urlHash: candidate.urlHash,
        sourceKind: candidate.sourceKind,
        ...safePersistenceDiagnostic(error),
      });
    });
  if (candidates.length > 0 && result.persistedCount === 0) {
    throw new ProductImagePersistenceError(
      'No detected Product images could be persisted.',
      { cause: result.failures[0]?.error },
    );
  }
  const removed = await prisma.productSourceImage.deleteMany({
    where: {
      productId: product.id,
      projectId: product.projectId,
      workspaceId: product.workspaceId,
      status: 'DETECTED',
      ...(candidates.length ? { urlHash: { notIn: candidates.map(({ urlHash }) => urlHash) } } : {}),
    },
  });
  await prisma.auditLog.create({
      data: {
        organizationId: product.organizationId,
        workspaceId: product.workspaceId,
        userId,
        action: 'product.images_detected',
        entityType: 'Product',
        entityId: product.id,
        metadata: {
          projectId: product.projectId,
          detectedCount: candidates.length,
          persistedCount: result.persistedCount,
          rejectedCount: result.failures.length,
          removedStaleCount: removed.count,
        },
      },
    });
  return listProductSourceImages(userId, identity);
}

export async function rediscoverProductSourceImages(userId: string, identity: Identity) {
  const product = await authorize(userId, identity, true);
  if (!product.sourceUrl) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'Add and analyze a Product URL or Supplier URL before finding source images.',
      422,
    );
  }
  try {
    const extracted = await extractProductPage(product.sourceUrl);
    return persistDetectedProductImages(userId, identity, extracted.finalUrl, extracted.sourceImages);
  } catch (error) {
    if (error instanceof ProductPageExtractionError) {
      throw new ShopifyImageError('SHOPIFY_IMAGE_UNAVAILABLE', error.message, error.status, { cause: error });
    }
    throw error;
  }
}

export async function listProductSourceImages(userId: string, identity: Identity) {
  const product = await authorize(userId, identity, false);
  const sources = await prisma.productSourceImage.findMany({
    where: { productId: product.id, projectId: product.projectId, workspaceId: product.workspaceId },
    orderBy: [{ status: 'asc' }, { score: 'desc' }, { firstDetectedAt: 'asc' }],
    select: { id: true, sourceKind: true, width: true, height: true, altText: true, status: true, score: true },
  });
  return sources.map(sourceDto);
}

export async function getProductSourceImage(userId: string, sourceImageId: string) {
  const source = await prisma.productSourceImage.findFirst({
    where: { id: sourceImageId, product: { workspace: { organization: { memberships: { some: { userId } } } } } },
    select: { imageUrl: true },
  });
  if (!source) throw new ShopifyImageError('SHOPIFY_IMAGE_PROJECT_NOT_FOUND', 'The source image is unavailable.', 404);
  return source;
}

export async function getManagedProductImageSource(userId: string, imageId: string) {
  const image = await prisma.shopifyProjectImage.findFirst({
    where: {
      id: imageId,
      active: true,
      sourceUrl: { not: null },
      configuration: {
        product: {
          workspace: {
            organization: { memberships: { some: { userId } } },
          },
        },
      },
    },
    select: { sourceUrl: true },
  });
  if (!image?.sourceUrl) throw new ShopifyImageError('SHOPIFY_IMAGE_PROJECT_NOT_FOUND', 'The managed image is unavailable.', 404);
  return { imageUrl: image.sourceUrl };
}

export async function importDetectedProductImages(userId: string, untrusted: unknown) {
  const parsedInput = importSourceImagesSchema.safeParse(untrusted);
  if (!parsedInput.success) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'Select one or more available source images and try again.',
      422,
      { cause: parsedInput.error },
    );
  }
  const input = parsedInput.data;
  const product = await authorize(userId, identityFromImportInput(input), true);
  const sources = await prisma.productSourceImage.findMany({
    where: { id: { in: input.sourceImageIds }, productId: product.id, projectId: product.projectId, workspaceId: product.workspaceId },
    include: {
      importedImage: {
        select: { configuration: { select: { productId: true, workspaceId: true } } },
      },
    },
  });
  if (sources.length !== new Set(input.sourceImageIds).size) throw new ShopifyImageError('SHOPIFY_IMAGE_INVALID_INPUT', 'One or more selected source images are unavailable.', 422);

  let newlyImportedCount = 0;
  for (const source of sources) {
    if (source.status === 'IMPORTED' && source.importedImageId) {
      const importedConfiguration = source.importedImage?.configuration;
      if (
        !importedConfiguration
        || importedConfiguration.productId !== product.id
        || importedConfiguration.workspaceId !== product.workspaceId
      ) {
        throw new ShopifyImageError('SHOPIFY_IMAGE_INVALID_INPUT', 'The imported image linkage is invalid for this Product.', 409);
      }
      continue;
    }
    try {
      await addUserManagedRemoteImage(
        userId,
        product.id,
        { url: source.imageUrl, altText: source.altText },
        { sourceKind: source.sourceKind, sourcePageUrl: source.sourcePageUrl, sourceImageId: source.id },
      );
      newlyImportedCount += 1;
    } catch (error) {
      console.error('Product source image import failed', {
        stage: 'managed_product_image_creation',
        workspaceId: product.workspaceId,
        projectId: product.projectId,
        productId: product.id,
        sourceImageId: source.id,
        urlHash: source.urlHash,
        ...safePersistenceDiagnostic(error),
      });
      throw error;
    }
  }
  await prisma.auditLog.create({
    data: {
      organizationId: product.organizationId,
      workspaceId: product.workspaceId,
      userId,
      action: 'product.images_imported',
      entityType: 'Product',
      entityId: product.id,
      metadata: { projectId: product.projectId, importedCount: newlyImportedCount, requestedCount: sources.length },
    },
  });
  return {
    configuration: await getUserShopifyImages(userId, product.id),
    sources: await listProductSourceImages(userId, identityFromImportInput(input)),
  };
}
