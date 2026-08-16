import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyImageProjectContext,
  ShopifyImageRepository,
} from './image-repository.ts';
import {
  addManagedRemoteImage,
  getShopifyImages,
  initiateShopifyImageUpload,
  saveShopifyImages,
} from './image-service.ts';
import { ShopifyImageError } from './image-errors.ts';

function context(
  overrides: Partial<ShopifyImageProjectContext> = {},
): ShopifyImageProjectContext {
  return {
    actorUserId: 'user',
    organizationId: 'organization',
    workspaceId: 'workspace',
    projectId: 'project',
    role: 'OWNER',
    archived: false,
    shopifyStoreId: 'store',
    grantedScopes: ['read_files', 'write_files'],
    shopifyProductId: '123',
    configuration: null,
    ...overrides,
  };
}

const repository = {
  async saveConfiguration() { return false; },
  async createUploadSession(input: {
    context: ShopifyImageProjectContext;
    filename: string;
    mimeType: 'image/png';
    byteSize: number;
    altText: string | null;
    expiresAt: Date;
  }) {
    return {
      id: '00000000-0000-4000-8000-000000000001',
      actorUserId: input.context.actorUserId,
      workspaceId: input.context.workspaceId,
      projectId: input.context.projectId,
      filename: input.filename,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      altText: input.altText,
      status: 'PENDING' as const,
      expiresAt: input.expiresAt,
    };
  },
} as unknown as ShopifyImageRepository;

test('active members can view client-safe empty configuration', () => {
  assert.deepEqual(getShopifyImages(context({ role: 'VIEWER' })), {
    version: 0,
    images: [],
    lastPublishedAt: null,
    reorderPending: false,
  });
  assert.throws(() => getShopifyImages(null), { code: 'SHOPIFY_IMAGE_PROJECT_NOT_FOUND' });
});

test('non-owner, archived, disconnected, and missing file scopes cannot initiate', async () => {
  for (const project of [
    context({ role: 'MEMBER' }),
    context({ archived: true }),
    context({ shopifyStoreId: null }),
    context({ grantedScopes: ['write_products'] }),
  ]) {
    await assert.rejects(
      () => initiateShopifyImageUpload(repository, project, {
        filename: 'image.png',
        mimeType: 'image/png',
        byteSize: 100,
        altText: null,
      }),
      ShopifyImageError,
    );
  }
});

test('upload initiation is short-lived and returns no Shopify credentials', async () => {
  const result = await initiateShopifyImageUpload(repository, context(), {
    filename: 'image.png',
    mimeType: 'image/png',
    byteSize: 100,
    altText: null,
  });
  assert.match(result.uploadUrl, /project\/shopify-images\/upload-complete$/);
  assert.equal('parameters' in result, false);
  assert.ok(new Date(result.expiresAt).valueOf() > Date.now());
});

test('configuration save uses optimistic conflict behavior', async () => {
  await assert.rejects(
    () => saveShopifyImages(repository, context(), { version: 1, images: [] }),
    { code: 'SHOPIFY_IMAGE_CONFIG_CONFLICT' },
  );
});

test('managed source import creates a Product image without Shopify publication or store linkage', async () => {
  const calls: string[] = [];
  const managedRepository = {
    async createImage(input: Parameters<ShopifyImageRepository['createImage']>[0]) {
      calls.push(`create:${input.initialStatus}:${input.context.projectId}:${input.sourceImageId}`);
      return 'managed-image-id';
    },
    async resolveProject() {
      return context({
        shopifyStoreId: null,
        grantedScopes: [],
        shopifyProductId: null,
        configuration: {
          id: 'configuration',
          version: 1,
          images: [{
            id: 'managed-image-id',
            contentHash: 'a'.repeat(64),
            altText: 'Front view',
            position: 0,
            isPrimary: true,
            active: true,
            status: 'CONFIGURED',
            shopifyFileId: null,
            shopifyMediaId: null,
            sourceType: 'REMOTE_URL',
            sourceUrl: 'https://images.example/product.png',
            originalFilename: null,
            mimeType: 'image/png',
            byteSize: 9,
            shopifyImageUrl: null,
            firstPublishedAt: null,
            lastPublishedAt: null,
            lastErrorCategory: null,
            width: null,
            height: null,
            sourceProvenance: 'JSON_LD',
            sourcePageUrl: 'https://shop.example/product',
          }],
        },
      });
    },
  } as unknown as ShopifyImageRepository;
  const result = await addManagedRemoteImage(
    managedRepository,
    context({ shopifyStoreId: null, grantedScopes: [], shopifyProductId: null }),
    { url: 'https://images.example/product.png', altText: 'Front view' },
    { sourceKind: 'JSON_LD', sourcePageUrl: 'https://shop.example/product', sourceImageId: 'source-image-id' },
    async () => ({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
      mimeType: 'image/png' as const,
      byteSize: 9,
      canonicalUrl: 'https://images.example/product.png',
      contentHash: 'unused',
    }),
  );
  assert.equal(result.localImageId, 'managed-image-id');
  assert.deepEqual(calls, ['create:CONFIGURED:project:source-image-id']);
  assert.equal(result.configuration.images[0]?.thumbnailUrl, '/api/product-images/managed/managed-image-id/preview');
});
