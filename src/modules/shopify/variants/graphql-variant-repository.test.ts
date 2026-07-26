import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyGraphqlVariantRepository,
} from './graphql-variant-repository.ts';
import { ShopifyVariantError } from './variant-errors.ts';

function response(data: unknown) {
  return {
    data,
    status: 200,
    requestId: null,
    apiCallLimit: null,
  };
}

function variant(id = '9001') {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    price: '19.99',
    compareAtPrice: null,
    barcode: null,
    selectedOptions: [{ name: 'Size', value: 'Small' }],
    inventoryItem: { sku: 'SMALL' },
  };
}

function currentProductPayload() {
  return {
    data: {
      shop: {
        currencyCode: 'USD',
        resourceLimits: {
          maxProductOptions: 3,
          maxProductVariants: 2048,
        },
      },
      product: {
        id: 'gid://shopify/Product/123456789',
        hasOnlyDefaultVariant: false,
        options: [{
          id: 'gid://shopify/ProductOption/1',
          name: 'Size',
          position: 1,
          values: ['Small', 'Large'],
        }],
        variants: {
          nodes: [variant()],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      },
    },
  };
}

test('looks up current Shopify options and variants with a fixed GraphQL query', async () => {
  let requestBody: unknown;
  const repository = createShopifyGraphqlVariantRepository(
    async (_workspaceId, input) => {
      requestBody = input.body;
      return response(currentProductPayload());
    },
  );
  const result = await repository.getCurrent('workspace', '123456789');
  assert.equal(result.variants[0].id, '9001');
  assert.equal(result.variants[0].sku, 'SMALL');
  assert.match(
    String((requestBody as { query: string }).query),
    /ListingPilotProductVariants/,
  );
  assert.equal(
    (requestBody as { variables: { productId: string } }).variables.productId,
    'gid://shopify/Product/123456789',
  );
});

test('rejects malformed and top-level GraphQL error responses safely', async () => {
  for (const payload of [
    { data: { product: { unexpected: true } } },
    { errors: [{ message: 'secret internal GraphQL detail' }] },
  ]) {
    const repository = createShopifyGraphqlVariantRepository(
      async () => response(payload),
    );
    await assert.rejects(
      repository.getCurrent('workspace', '123456789'),
      (error) => (
        error instanceof ShopifyVariantError
        && !error.message.includes('secret')
      ),
    );
  }
});

test('normalizes Shopify userErrors without exposing raw messages', async () => {
  const repository = createShopifyGraphqlVariantRepository(
    async () => response({
      data: {
        productVariantsBulkCreate: {
          productVariants: [],
          userErrors: [{
            field: ['variants', '0', 'price'],
            message: 'raw merchant-specific value',
            code: 'INVALID_VALUE',
          }],
        },
      },
    }),
  );
  await assert.rejects(
    repository.createVariants('workspace', '123456789', [{
      localVariantId: 'local',
      optionValues: [{ name: 'Size', value: 'Small' }],
      price: '19.99',
      compareAtPrice: null,
      sku: null,
      barcode: null,
    }]),
    (error) => (
      error instanceof ShopifyVariantError
      && error.code === 'SHOPIFY_VARIANT_VALIDATION_FAILED'
      && !error.message.includes('raw')
    ),
  );
});

test('creates options with LEAVE_AS_IS semantics', async () => {
  let query = '';
  let variables: unknown;
  const repository = createShopifyGraphqlVariantRepository(
    async (_workspaceId, input) => {
      ({ query, variables } = input.body as {
        query: string;
        variables: unknown;
      });
      return response({
        data: {
          productOptionsCreate: {
            product: {
              id: 'gid://shopify/Product/123456789',
              options: [{
                id: 'gid://shopify/ProductOption/1',
                name: 'Size',
                position: 1,
                values: ['Small', 'Large'],
              }],
            },
            userErrors: [],
          },
        },
      });
    },
  );
  await repository.createOptions('workspace', '123456789', [{
    name: 'Size',
    values: ['Small', 'Large'],
  }]);
  assert.match(query, /variantStrategy: LEAVE_AS_IS/);
  assert.deepEqual(
    (variables as { options: unknown }).options,
    [{ name: 'Size', values: [{ name: 'Small' }, { name: 'Large' }] }],
  );
});

test('creates variants with price, barcode, SKU, and option values', async () => {
  let variables: unknown;
  const repository = createShopifyGraphqlVariantRepository(
    async (_workspaceId, input) => {
      variables = (input.body as { variables: unknown }).variables;
      return response({
        data: {
          productVariantsBulkCreate: {
            productVariants: [variant()],
            userErrors: [],
          },
        },
      });
    },
  );
  const result = await repository.createVariants(
    'workspace',
    '123456789',
    [{
      localVariantId: 'local-small',
      optionValues: [{ name: 'Size', value: 'Small' }],
      price: '19.99',
      compareAtPrice: null,
      sku: 'SMALL',
      barcode: '1234',
    }],
  );
  assert.equal(result[0].localVariantId, 'local-small');
  const input = (variables as {
    variants: Array<Record<string, unknown>>;
  }).variants[0];
  assert.equal(input.price, '19.99');
  assert.deepEqual(input.inventoryItem, { sku: 'SMALL' });
  assert.equal('inventoryQuantities' in input, false);
});

test('updates variants using only server-generated global IDs', async () => {
  let variables: unknown;
  const repository = createShopifyGraphqlVariantRepository(
    async (_workspaceId, input) => {
      variables = (input.body as { variables: unknown }).variables;
      return response({
        data: {
          productVariantsBulkUpdate: {
            productVariants: [variant()],
            userErrors: [],
          },
        },
      });
    },
  );
  await repository.updateVariants('workspace', '123456789', [{
    localVariantId: 'local-small',
    shopifyVariantId: '9001',
    price: '19.99',
    compareAtPrice: null,
    sku: 'SMALL',
    barcode: null,
  }]);
  assert.equal(
    (variables as { variants: Array<{ id: string }> }).variants[0].id,
    'gid://shopify/ProductVariant/9001',
  );
});
