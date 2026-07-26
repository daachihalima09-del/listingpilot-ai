import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPIFY_METAFIELD_CATALOG,
} from './metafield-catalog.ts';
import {
  createShopifyGraphqlMetafieldRepository,
} from './graphql-metafield-repository.ts';
import {
  ShopifyMetafieldDefinitionRaceError,
  ShopifyMetafieldError,
} from './metafield-errors.ts';

function response(data: unknown) {
  return {
    data,
    status: 200,
    requestId: null,
    apiCallLimit: null,
  };
}

function definitionNode(type = 'single_line_text_field') {
  return {
    id: 'gid://shopify/MetafieldDefinition/100',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    ownerType: 'PRODUCT',
    type: { name: type },
  };
}

function metafieldNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gid://shopify/Metafield/200',
    legacyResourceId: '200',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    type: 'single_line_text_field',
    value: 'Q80D',
    compareDigest: 'digest',
    ...overrides,
  };
}

test('reuses an existing compatible definition', async () => {
  const repository = createShopifyGraphqlMetafieldRepository(async () => (
    response({
      data: {
        metafieldDefinitions: { nodes: [definitionNode()] },
      },
    })
  ));
  const found = await repository.getDefinition(
    'workspace',
    SHOPIFY_METAFIELD_CATALOG.find(
      ({ catalogId }) => catalogId === 'listingpilot_specs.model_number',
    )!,
  );
  assert.deepEqual(found, {
    id: '100',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    type: 'single_line_text_field',
  });
});

test('creates a missing definition with a fixed GraphQL document', async () => {
  let body: unknown;
  const repository = createShopifyGraphqlMetafieldRepository(
    async (_workspace, request) => {
      body = request.body;
      return response({
        data: {
          metafieldDefinitionCreate: {
            createdDefinition: definitionNode(),
            userErrors: [],
          },
        },
      });
    },
  );
  const created = await repository.createDefinition(
    'workspace',
    SHOPIFY_METAFIELD_CATALOG.find(
      ({ catalogId }) => catalogId === 'listingpilot_specs.model_number',
    )!,
  );
  assert.equal(created.id, '100');
  assert.equal(JSON.stringify(body).includes('metafieldDefinitionCreate'), true);
});

test('surfaces an already-exists definition race for safe reread', async () => {
  const repository = createShopifyGraphqlMetafieldRepository(async () => (
    response({
      data: {
        metafieldDefinitionCreate: {
          createdDefinition: null,
          userErrors: [{
            field: ['definition'],
            message: 'Definition already exists',
            code: 'TAKEN',
          }],
        },
      },
    })
  ));
  await assert.rejects(
    repository.createDefinition(
      'workspace',
      SHOPIFY_METAFIELD_CATALOG[2],
    ),
    ShopifyMetafieldDefinitionRaceError,
  );
});

test('malformed and top-level GraphQL errors are normalized safely', async () => {
  for (const data of [
    { data: { metafieldDefinitions: { nodes: [{ bad: true }] } } },
    { errors: [{ message: 'raw private GraphQL failure' }] },
  ]) {
    const repository = createShopifyGraphqlMetafieldRepository(async () => (
      response(data)
    ));
    await assert.rejects(
      repository.getDefinition('workspace', SHOPIFY_METAFIELD_CATALOG[0]),
      (error: unknown) => (
        error instanceof ShopifyMetafieldError
        && error.code === 'SHOPIFY_METAFIELD_INVALID_RESPONSE'
        && !error.message.includes('private')
      ),
    );
  }
});

test('loads approved product metafields and ignores unknown remote fields', async () => {
  const repository = createShopifyGraphqlMetafieldRepository(async () => (
    response({
      data: {
        product: {
          id: 'gid://shopify/Product/123',
          metafields: {
            nodes: [
              metafieldNode(),
              metafieldNode({
                id: 'gid://shopify/Metafield/201',
                legacyResourceId: '201',
                namespace: 'merchant_private',
                key: 'secret',
              }),
            ],
          },
        },
      },
    })
  ));
  const fields = await repository.getCurrent('workspace', '123');
  assert.equal(fields.length, 1);
  assert.equal(fields[0].namespace, 'listingpilot_specs');
});

test('rejects missing products and malformed lookup responses', async () => {
  const missing = createShopifyGraphqlMetafieldRepository(async () => response({
    data: { product: null },
  }));
  await assert.rejects(
    missing.getCurrent('workspace', '123'),
    (error: unknown) => (
      error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_PRODUCT_NOT_FOUND'
    ),
  );
  const malformed = createShopifyGraphqlMetafieldRepository(async () => response({
    data: { product: { id: 'bad', metafields: { nodes: [] } } },
  }));
  await assert.rejects(
    malformed.getCurrent('workspace', '123'),
    ShopifyMetafieldError,
  );
});

test('validates metafieldsSet success, userErrors, and batch limits', async () => {
  let userErrors = false;
  const repository = createShopifyGraphqlMetafieldRepository(async () => (
    response({
      data: {
        metafieldsSet: {
          metafields: userErrors ? [] : [metafieldNode()],
          userErrors: userErrors ? [{
            field: ['metafields', '0'],
            message: 'Invalid value',
            code: 'INVALID_VALUE',
          }] : [],
        },
      },
    })
  ));
  const input = [{
    catalogId: 'listingpilot_specs.model_number',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    type: 'single_line_text_field',
    value: 'Q80D',
    compareDigest: null,
  }];
  assert.equal((await repository.setMetafields(
    'workspace',
    '123',
    input,
  ))[0].id, '200');
  userErrors = true;
  await assert.rejects(
    repository.setMetafields('workspace', '123', input),
    (error: unknown) => (
      error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_VALIDATION_FAILED'
    ),
  );
  await assert.rejects(
    repository.setMetafields('workspace', '123', []),
    ShopifyMetafieldError,
  );
});

