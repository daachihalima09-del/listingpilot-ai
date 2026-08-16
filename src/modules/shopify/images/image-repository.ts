import type {
  LocalShopifyImage,
} from './image-sync-plan.ts';
import type {
  ShopifyImageMimeType,
} from './image-limits.ts';

export interface PersistedShopifyImage extends LocalShopifyImage {
  sourceType: 'REMOTE_URL' | 'LOCAL_UPLOAD';
  sourceUrl: string | null;
  originalFilename: string | null;
  mimeType: ShopifyImageMimeType;
  byteSize: number;
  shopifyImageUrl: string | null;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  lastErrorCategory: string | null;
  width: number | null;
  height: number | null;
  sourceProvenance: string | null;
  sourcePageUrl: string | null;
}

export interface PersistedImageConfiguration {
  id: string;
  version: number;
  images: PersistedShopifyImage[];
}

export interface ShopifyImageProjectContext {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  archived: boolean;
  shopifyStoreId: string | null;
  grantedScopes: string[];
  shopifyProductId: string | null;
  configuration: PersistedImageConfiguration | null;
}

export interface ShopifyImageConfigurationDto {
  version: number;
  images: Array<{
    localId: string;
    sourceType: 'REMOTE_URL' | 'LOCAL_UPLOAD';
    filename: string | null;
    mimeType: ShopifyImageMimeType;
    byteSize: number;
    width: number | null;
    height: number | null;
    quality: 'GOOD' | 'NEEDS_ATTENTION' | 'LOW_RESOLUTION';
    qualityWarning: string | null;
    altText: string | null;
    position: number;
    isPrimary: boolean;
    status:
      | 'CONFIGURED'
      | 'UPLOADING'
      | 'PROCESSING'
      | 'READY'
      | 'FAILED'
      | 'MISSING_REMOTE'
      | 'INACTIVE';
    published: boolean;
    thumbnailUrl: string | null;
    lastError: string | null;
  }>;
  lastPublishedAt: string | null;
  reorderPending: boolean;
}

export interface ImageUploadSession {
  id: string;
  actorUserId: string;
  workspaceId: string;
  projectId: string;
  filename: string;
  mimeType: ShopifyImageMimeType;
  byteSize: number;
  altText: string | null;
  status: 'PENDING' | 'PROCESSING' | 'CONSUMED';
  expiresAt: Date;
}

export interface ShopifyImageRepository {
  resolveProject(
    actorUserId: string,
    projectId: string,
  ): Promise<ShopifyImageProjectContext | null>;
  saveConfiguration(input: {
    context: ShopifyImageProjectContext;
    version: number;
    images: Array<{
      localId: string;
      altText: string | null;
      position: number;
      isPrimary: boolean;
      active: boolean;
    }>;
  }): Promise<boolean>;
  createImage(input: {
    context: ShopifyImageProjectContext;
    sourceType: 'REMOTE_URL' | 'LOCAL_UPLOAD';
    sourceUrl: string | null;
    originalFilename: string | null;
    mimeType: ShopifyImageMimeType;
    byteSize: number;
    contentHash: string;
    width: number | null;
    height: number | null;
    sourceProvenance?: string | null;
    sourcePageUrl?: string | null;
    sourceImageId?: string;
    altText: string | null;
    initialStatus?: PersistedShopifyImage['status'];
  }): Promise<string>;
  persistCreatedFile(input: {
    context: ShopifyImageProjectContext;
    localImageId: string;
    shopifyFileId: string;
    status: PersistedShopifyImage['status'];
    imageUrl: string | null;
  }): Promise<void>;
  updateImageState(input: {
    context: ShopifyImageProjectContext;
    localImageId: string;
    status: PersistedShopifyImage['status'];
    shopifyMediaId?: string | null;
    shopifyImageUrl?: string | null;
    errorCategory?: string | null;
    publishedAt?: Date;
  }): Promise<void>;
  createUploadSession(input: {
    context: ShopifyImageProjectContext;
    filename: string;
    mimeType: ShopifyImageMimeType;
    byteSize: number;
    altText: string | null;
    expiresAt: Date;
  }): Promise<ImageUploadSession>;
  claimUploadSession(input: {
    actorUserId: string;
    workspaceId: string;
    projectId: string;
    uploadId: string;
    now: Date;
  }): Promise<ImageUploadSession | null>;
  releaseUploadSession(uploadId: string): Promise<void>;
  consumeUploadSession(uploadId: string, consumedAt: Date): Promise<void>;
  createAudit(input: {
    context: ShopifyImageProjectContext;
    action:
      | 'shopify.images_uploaded'
      | 'shopify.images_metadata_updated'
      | 'shopify.images_reordered'
      | 'shopify.images_publish_unchanged'
      | 'shopify.images_publish_partial'
      | 'shopify.image_upload_failed'
      | 'shopify.image_reorder_pending';
    metadata: {
      localImageIds: string[];
      created: number;
      updated: number;
      unchanged: number;
      pending: number;
      failed: number;
      batchCount: number;
      failureCategory?: string;
    };
  }): Promise<void>;
}
