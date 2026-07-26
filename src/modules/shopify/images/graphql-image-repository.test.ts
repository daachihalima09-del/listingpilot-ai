import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyGraphqlImageRepository,
  productGid,
} from './graphql-image-repository.ts';
import { ShopifyImageError } from './image-errors.ts';

function response(data: unknown) {
  return {
    status: 200,
    headers: new Headers(),
    data,
    requestId: null,
    apiCallLimit: null,
  };
}

const image = {
  __typename: 'MediaImage',
  id: 'gid://shopify/MediaImage/101',
  fileStatus: 'READY',
  alt: 'Front',
  createdAt: '2026-01-01T00:00:00.000Z',
  image: { url: 'https://cdn.shopify.com/image.png' },
};

test('Shopify identifiers are generated and validated server-side', () => {
  assert.equal(productGid('123'), 'gid://shopify/Product/123');
  assert.throws(() => productGid('gid://shopify/Product/123'));
});

test('current media lookup validates image nodes and preserves unknown media', async () => {
  const repository = createShopifyGraphqlImageRepository(async () => response({
    data: {
      product: {
        id: 'gid://shopify/Product/123',
        media: {
          nodes: [
            { ...image, mediaContentType: 'IMAGE', status: 'READY' },
            {
              __typename: 'Video',
              id: 'gid://shopify/Video/9',
              alt: null,
              mediaContentType: 'VIDEO',
              status: 'READY',
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    },
  }));
  const media = await repository.getProductMedia('workspace', '123');
  assert.equal(media[0].kind, 'IMAGE');
  assert.equal(media[1].kind, 'UNMANAGED');
});

test('staged upload, file update and reorder reject userErrors and malformed responses', async () => {
  const repository = createShopifyGraphqlImageRepository(async (
    _workspace,
    request,
  ) => {
    const query = (request.body as { query: string }).query;
    if (query.includes('StagedImageUpload')) {
      return response({ data: { stagedUploadsCreate: {
        stagedTargets: [],
        userErrors: [{ field: ['input'], message: 'Rejected' }],
      } } });
    }
    return response({ unexpected: true });
  });
  await assert.rejects(
    () => repository.createStagedTarget('workspace', {
      filename: 'image.png',
      mimeType: 'image/png',
      byteSize: 10,
    }),
    (error) => error instanceof ShopifyImageError
      && error.code === 'SHOPIFY_IMAGE_INVALID_INPUT',
  );
  await assert.rejects(
    () => repository.getFiles('workspace', ['101']),
    (error) => error instanceof ShopifyImageError
      && error.code === 'SHOPIFY_IMAGE_INVALID_RESPONSE',
  );
});

test('safe mutations contain only server-built IDs and variables', async () => {
  let variables: unknown;
  const repository = createShopifyGraphqlImageRepository(async (
    _workspace,
    request,
  ) => {
    variables = (request.body as { variables: unknown }).variables;
    return response({ data: { fileUpdate: { files: [image], userErrors: [] } } });
  });
  await repository.updateFiles('workspace', [{
    fileId: '101',
    productId: '123',
    altText: 'Front',
  }]);
  assert.deepEqual(variables, {
    files: [{
      id: 'gid://shopify/MediaImage/101',
      alt: 'Front',
      referencesToAdd: ['gid://shopify/Product/123'],
    }],
  });
});
