import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyImageProjectContext,
  ShopifyImageRepository,
} from './image-repository.ts';
import {
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
