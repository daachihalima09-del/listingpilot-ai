import type {
  ShopifyGraphqlImageRepository,
} from './graphql-image-repository.ts';
import { uploadImageToStagedTarget } from './graphql-image-repository.ts';
import {
  ShopifyImageError,
  normalizeShopifyImageError,
} from './image-errors.ts';
import { SHOPIFY_IMAGE_LIMITS } from './image-limits.ts';
import type {
  PersistedShopifyImage,
  ShopifyImageConfigurationDto,
  ShopifyImageProjectContext,
  ShopifyImageRepository,
} from './image-repository.ts';
import { buildImageSynchronizationPlan } from './image-sync-plan.ts';
import {
  imageConfigurationInputSchema,
  remoteImageInputSchema,
  uploadInitiationInputSchema,
  validateImageBytes,
} from './image-validation.ts';
import { downloadRemoteImage } from './remote-image.ts';

export interface ImagePublishResult {
  outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL' | 'PENDING';
  created: number;
  updated: number;
  unchanged: number;
  pending: number;
  failed: number;
  reorderPending: boolean;
  message: string;
  configuration: ShopifyImageConfigurationDto;
}

function requireProject(context: ShopifyImageProjectContext | null) {
  if (!context) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_PROJECT_NOT_FOUND',
      'The requested project is unavailable.',
      404,
    );
  }
  return context;
}

function requireOwner(context: ShopifyImageProjectContext | null) {
  const project = requireProject(context);
  if (project.role !== 'OWNER') {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_FORBIDDEN',
      'Store-owner permission is required to manage product images.',
      403,
    );
  }
  if (project.archived) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_PROJECT_ARCHIVED',
      'Restore this project before changing product images.',
      409,
    );
  }
  return project;
}

function requirePublishing(context: ShopifyImageProjectContext | null) {
  const project = requireOwner(context);
  if (!project.shopifyStoreId) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_STORE_NOT_CONNECTED',
      'Connect Shopify before managing product images.',
      409,
    );
  }
  if (
    !project.grantedScopes.includes('read_files')
    || !project.grantedScopes.includes('write_files')
  ) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_FILES_SCOPE_REQUIRED',
      'Reconnect Shopify to grant product image permissions.',
      409,
    );
  }
  return project;
}

function requireLinkedProduct(context: ShopifyImageProjectContext | null) {
  const project = requirePublishing(context);
  if (!project.shopifyProductId) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_PRODUCT_NOT_LINKED',
      'Publish the Shopify product before publishing images.',
      409,
    );
  }
  return project;
}

export function buildImageConfigurationDto(
  context: ShopifyImageProjectContext,
): ShopifyImageConfigurationDto {
  const images = (context.configuration?.images ?? [])
    .filter(({ active }) => active)
    .sort((left, right) => left.position - right.position);
  return {
    version: context.configuration?.version ?? 0,
    images: images.map((image) => ({
      localId: image.id,
      sourceType: image.sourceType,
      filename: image.originalFilename,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      altText: image.altText,
      position: image.position,
      isPrimary: image.isPrimary,
      status: image.status,
      published: Boolean(image.shopifyMediaId && image.lastPublishedAt),
      thumbnailUrl: clientSafeImageUrl(image.shopifyImageUrl),
      lastError: image.lastErrorCategory
        ? 'This image needs attention before it can be published.'
        : null,
    })),
    lastPublishedAt: images.flatMap(
      ({ lastPublishedAt }) => lastPublishedAt ? [lastPublishedAt] : [],
    ).sort((left, right) => right.valueOf() - left.valueOf())[0]
      ?.toISOString() ?? null,
    reorderPending: false,
  };
}

function clientSafeImageUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    const sensitive = ['signature', 'sig', 'token', 'expires'];
    if ([...url.searchParams.keys()].some((key) => (
      sensitive.some((item) => key.toLowerCase().includes(item))
    ))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function refreshed(
  repository: ShopifyImageRepository,
  context: ShopifyImageProjectContext,
) {
  return requireProject(await repository.resolveProject(
    context.actorUserId,
    context.projectId,
  ));
}

export function getShopifyImages(context: ShopifyImageProjectContext | null) {
  return buildImageConfigurationDto(requireProject(context));
}

export async function saveShopifyImages(
  repository: ShopifyImageRepository,
  context: ShopifyImageProjectContext | null,
  untrustedInput: unknown,
) {
  const project = requireOwner(context);
  const input = imageConfigurationInputSchema.parse(untrustedInput);
  if (!project.configuration && input.version !== 0) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_CONFIG_CONFLICT',
      'A newer image configuration exists. Refresh before saving.',
      409,
    );
  }
  if (!project.configuration || !await repository.saveConfiguration({
    context: project,
    ...input,
  })) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_CONFIG_CONFLICT',
      'A newer image configuration exists. Refresh before saving.',
      409,
    );
  }
  return buildImageConfigurationDto(await refreshed(repository, project));
}

function safeShopifyFilename(hash: string, mimeType: string) {
  const extension = mimeType === 'image/jpeg'
    ? 'jpg'
    : mimeType === 'image/png' ? 'png' : 'webp';
  return `listingpilot-${hash}.${extension}`;
}

async function createShopifyFile(
  shopify: ShopifyGraphqlImageRepository,
  context: ShopifyImageProjectContext,
  input: {
    bytes: Uint8Array;
    contentHash: string;
    mimeType: PersistedShopifyImage['mimeType'];
    altText: string | null;
  },
) {
  const filename = safeShopifyFilename(input.contentHash, input.mimeType);
  const target = await shopify.createStagedTarget(context.workspaceId, {
    filename,
    mimeType: input.mimeType,
    byteSize: input.bytes.length,
  });
  await uploadImageToStagedTarget(target, {
    bytes: input.bytes,
    filename,
    mimeType: input.mimeType,
  });
  return shopify.createFile(context.workspaceId, {
    resourceUrl: target.resourceUrl,
    filename,
    altText: input.altText,
  });
}

async function registerBytes(
  dependencies: {
    repository: ShopifyImageRepository;
    shopify: ShopifyGraphqlImageRepository;
  },
  context: ShopifyImageProjectContext,
  input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string | null;
    sourceType: 'REMOTE_URL' | 'LOCAL_UPLOAD';
    sourceUrl: string | null;
    altText: string | null;
  },
) {
  const validated = validateImageBytes({
    bytes: input.bytes,
    declaredMimeType: input.mimeType,
    ...(input.filename ? { filename: input.filename } : {}),
  });
  let localImageId: string | null = null;
  try {
    localImageId = await dependencies.repository.createImage({
      context,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      originalFilename: input.filename,
      ...validated,
      altText: input.altText,
    });
    const file = await createShopifyFile(dependencies.shopify, context, {
      bytes: input.bytes,
      contentHash: validated.contentHash,
      mimeType: validated.mimeType,
      altText: input.altText,
    });
    await dependencies.repository.persistCreatedFile({
      context,
      localImageId,
      shopifyFileId: file.id,
      status: file.fileStatus === 'FAILED'
        ? 'FAILED'
        : file.fileStatus === 'READY' ? 'READY' : 'PROCESSING',
      imageUrl: file.imageUrl,
    });
  } catch (error) {
    if (localImageId) {
      try {
        await dependencies.repository.updateImageState({
          context,
          localImageId,
          status: 'FAILED',
          errorCategory: 'upload_failed',
        });
        await dependencies.repository.createAudit({
          context,
          action: 'shopify.image_upload_failed',
          metadata: {
            localImageIds: [localImageId],
            created: 0,
            updated: 0,
            unchanged: 0,
            pending: 0,
            failed: 1,
            batchCount: 0,
            failureCategory: 'upload_failed',
          },
        });
      } catch {
        // Preserve the original safe failure.
      }
    }
    if (error instanceof Error && [
      'IMAGE_COUNT_LIMIT',
      'IMAGE_TOTAL_SIZE_LIMIT',
      'DUPLICATE_IMAGE',
    ].includes(error.message)) {
      throw new ShopifyImageError(
        'SHOPIFY_IMAGE_INVALID_INPUT',
        error.message === 'DUPLICATE_IMAGE'
          ? 'This image is already configured.'
          : 'The project image limit would be exceeded.',
        422,
        { cause: error },
      );
    }
    throw normalizeShopifyImageError(error);
  }
  return buildImageConfigurationDto(await refreshed(
    dependencies.repository,
    context,
  ));
}

export async function addRemoteShopifyImage(
  dependencies: {
    repository: ShopifyImageRepository;
    shopify: ShopifyGraphqlImageRepository;
  },
  context: ShopifyImageProjectContext | null,
  untrustedInput: unknown,
) {
  const project = requirePublishing(context);
  const input = remoteImageInputSchema.parse(untrustedInput);
  const remote = await downloadRemoteImage(input.url);
  return registerBytes(dependencies, project, {
    bytes: remote.bytes,
    mimeType: remote.mimeType,
    filename: null,
    sourceType: 'REMOTE_URL',
    sourceUrl: remote.canonicalUrl,
    altText: input.altText,
  });
}

export async function initiateShopifyImageUpload(
  repository: ShopifyImageRepository,
  context: ShopifyImageProjectContext | null,
  untrustedInput: unknown,
) {
  const project = requirePublishing(context);
  const input = uploadInitiationInputSchema.parse(untrustedInput);
  const session = await repository.createUploadSession({
    context: project,
    ...input,
    expiresAt: new Date(Date.now() + SHOPIFY_IMAGE_LIMITS.uploadSessionLifetimeMs),
  });
  return {
    uploadId: session.id,
    uploadUrl: `/api/projects/${project.projectId}/shopify-images/upload-complete`,
    expiresAt: session.expiresAt.toISOString(),
  };
}

export async function completeShopifyImageUpload(
  dependencies: {
    repository: ShopifyImageRepository;
    shopify: ShopifyGraphqlImageRepository;
  },
  context: ShopifyImageProjectContext | null,
  uploadId: string,
  file: File,
) {
  const project = requirePublishing(context);
  const session = await dependencies.repository.claimUploadSession({
    actorUserId: project.actorUserId,
    workspaceId: project.workspaceId,
    projectId: project.projectId,
    uploadId,
    now: new Date(),
  });
  if (!session) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_UPLOAD_EXPIRED',
      'This upload has expired or has already been used.',
      409,
    );
  }
  if (
    file.name !== session.filename
    || file.type !== session.mimeType
    || file.size !== session.byteSize
  ) {
    await dependencies.repository.releaseUploadSession(uploadId);
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_INVALID_INPUT',
      'The uploaded file does not match the initiated upload.',
      422,
    );
  }
  try {
    const result = await registerBytes(dependencies, project, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: session.mimeType,
      filename: session.filename,
      sourceType: 'LOCAL_UPLOAD',
      sourceUrl: null,
      altText: session.altText,
    });
    await dependencies.repository.consumeUploadSession(uploadId, new Date());
    return result;
  } catch (error) {
    await dependencies.repository.releaseUploadSession(uploadId);
    throw error;
  }
}

async function refreshFiles(
  repository: ShopifyImageRepository,
  shopify: ShopifyGraphqlImageRepository,
  context: ShopifyImageProjectContext,
) {
  const configured = context.configuration?.images ?? [];
  const fileIds = configured.flatMap(
    ({ active, shopifyFileId }) => active && shopifyFileId ? [shopifyFileId] : [],
  );
  const files = await shopify.getFiles(context.workspaceId, fileIds);
  const byId = new Map(files.map((file) => [file.id, file]));
  for (const image of configured) {
    if (!image.active || !image.shopifyFileId) continue;
    const file = byId.get(image.shopifyFileId);
    await repository.updateImageState({
      context,
      localImageId: image.id,
      status: !file
        ? 'MISSING_REMOTE'
        : file.fileStatus === 'FAILED'
          ? 'FAILED'
          : file.fileStatus === 'READY' ? 'READY' : 'PROCESSING',
      shopifyImageUrl: file?.imageUrl ?? null,
      errorCategory: file?.fileStatus === 'FAILED' ? 'processing_failed' : null,
    });
  }
  return refreshed(repository, context);
}

function publishCounts(
  context: ShopifyImageProjectContext,
  created: number,
  updated: number,
  unchanged: number,
) {
  const active = context.configuration?.images.filter(({ active }) => active) ?? [];
  return {
    created,
    updated,
    unchanged,
    pending: active.filter(({ status }) => (
      status === 'PROCESSING' || status === 'UPLOADING'
    )).length,
    failed: active.filter(({ status }) => (
      status === 'FAILED' || status === 'MISSING_REMOTE'
    )).length,
  };
}

async function pollJob(
  shopify: ShopifyGraphqlImageRepository,
  workspaceId: string,
  job: { id: string; done: boolean },
) {
  let current = job;
  for (
    let attempt = 0;
    !current.done && attempt < SHOPIFY_IMAGE_LIMITS.processingPollAttempts;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(
      resolve,
      SHOPIFY_IMAGE_LIMITS.processingPollDelayMs,
    ));
    const next = await shopify.getJob(workspaceId, current.id);
    if (!next) return false;
    current = next;
  }
  return current.done;
}

export async function publishShopifyImages(
  dependencies: {
    repository: ShopifyImageRepository;
    shopify: ShopifyGraphqlImageRepository;
  },
  context: ShopifyImageProjectContext | null,
): Promise<ImagePublishResult> {
  let project = requireLinkedProduct(context);
  if (!project.configuration) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_CONFIGURATION_MISSING',
      'Add an image before publishing.',
      409,
    );
  }
  project = await refreshFiles(dependencies.repository, dependencies.shopify, project);
  const remote = await dependencies.shopify.getProductMedia(
    project.workspaceId,
    project.shopifyProductId!,
  );
  const plan = buildImageSynchronizationPlan(
    project.configuration?.images ?? [],
    remote,
  );
  let created = 0;
  let updated = 0;
  let reorderPending = false;
  const publishedAt = new Date();
  try {
    const changes = [
      ...plan.attach.map((local) => ({ local, attach: true })),
      ...plan.metadataUpdate.map(({ local }) => ({ local, attach: false })),
    ];
    for (const change of changes) {
      const [file] = await dependencies.shopify.updateFiles(
        project.workspaceId,
        [{
          fileId: change.local.shopifyFileId!,
          altText: change.local.altText,
          ...(change.attach ? { productId: project.shopifyProductId! } : {}),
        }],
      );
      if (!file) throw new Error('Missing updated image.');
      await dependencies.repository.updateImageState({
        context: project,
        localImageId: change.local.id,
        status: file.fileStatus === 'READY' ? 'READY' : 'PROCESSING',
        shopifyMediaId: file.id,
        shopifyImageUrl: file.imageUrl,
        errorCategory: null,
        publishedAt,
      });
      if (change.attach) created += 1;
      else updated += 1;
    }
    project = await refreshed(dependencies.repository, project);
    const freshRemote = await dependencies.shopify.getProductMedia(
      project.workspaceId,
      project.shopifyProductId!,
    );
    const freshPlan = buildImageSynchronizationPlan(
      project.configuration?.images ?? [],
      freshRemote,
    );
    if (freshPlan.reorder.length) {
      reorderPending = !await pollJob(
        dependencies.shopify,
        project.workspaceId,
        await dependencies.shopify.reorderMedia(
          project.workspaceId,
          project.shopifyProductId!,
          freshPlan.reorder,
        ),
      );
    }
  } catch {
    project = await refreshed(dependencies.repository, project);
    const counts = publishCounts(project, created, updated, plan.unchanged.length);
    await dependencies.repository.createAudit({
      context: project,
      action: 'shopify.images_publish_partial',
      metadata: {
        localImageIds: project.configuration?.images
          .filter(({ active }) => active).map(({ id }) => id) ?? [],
        ...counts,
        batchCount: created + updated,
        failureCategory: 'shopify_or_persistence_failure',
      },
    }).catch(() => undefined);
    return {
      outcome: 'PARTIAL',
      ...counts,
      reorderPending,
      message: 'Some images completed, but publishing needs attention.',
      configuration: buildImageConfigurationDto(project),
    };
  }
  project = await refreshed(dependencies.repository, project);
  const counts = publishCounts(project, created, updated, plan.unchanged.length);
  const outcome = reorderPending || counts.pending
    ? 'PENDING'
    : counts.failed ? 'PARTIAL'
      : created || updated ? 'PUBLISHED' : 'UNCHANGED';
  const action = reorderPending
    ? 'shopify.image_reorder_pending'
    : created ? 'shopify.images_uploaded'
      : updated ? 'shopify.images_metadata_updated'
        : 'shopify.images_publish_unchanged';
  await dependencies.repository.createAudit({
    context: project,
    action,
    metadata: {
      localImageIds: project.configuration?.images
        .filter(({ active }) => active).map(({ id }) => id) ?? [],
      ...counts,
      batchCount: created + updated,
    },
  });
  return {
    outcome,
    ...counts,
    reorderPending,
    message: outcome === 'UNCHANGED'
      ? 'No Shopify image changes were required.'
      : outcome === 'PENDING'
        ? 'Shopify is still processing image changes.'
        : outcome === 'PARTIAL'
          ? 'Some images need attention.'
          : 'Shopify images were published successfully.',
    configuration: buildImageConfigurationDto(project),
  };
}

export async function refreshShopifyImages(
  dependencies: {
    repository: ShopifyImageRepository;
    shopify: ShopifyGraphqlImageRepository;
  },
  context: ShopifyImageProjectContext | null,
) {
  const project = requireLinkedProduct(context);
  return buildImageConfigurationDto(await refreshFiles(
    dependencies.repository,
    dependencies.shopify,
    project,
  ));
}
