import assert from 'node:assert/strict';
import test from 'node:test';
import { listShopifyCatalog } from './catalog-service.ts';
import { buildShopifyCatalogSearch } from './catalog-search.ts';
import { SHOPIFY_CATALOG_PRODUCTS_QUERY } from './graphql-documents.ts';

const product = {
  id: 'gid://shopify/Product/123',
  legacyResourceId: '123',
  title: 'Example',
  handle: 'example',
  vendor: 'Vendor',
  productType: 'Type',
  status: 'ACTIVE',
  updatedAt: '2026-07-27T12:00:00.000Z',
  featuredMedia: null,
  variantsCount: { count: 2 },
  priceRangeV2: {
    minVariantPrice: { amount: '10.00', currencyCode: 'USD' },
    maxVariantPrice: { amount: '20.00', currencyCode: 'USD' },
  },
};

test('builds bounded escaped Shopify search and filters', () => {
  assert.equal(buildShopifyCatalogSearch({
    search: 'TV "Pro"',
    status: 'ACTIVE',
    vendor: 'A\\B',
    productType: 'Display',
    importState: 'ALL',
  }), '(title:"TV \\"Pro\\"" OR sku:"TV \\"Pro\\"") AND (status:active) AND (vendor:"A\\\\B") AND (product_type:"Display")');
});

test('uses one lightweight paginated query and one batch linkage lookup', async () => {
  let batchCalls = 0;
  let requestBody: unknown;
  const result = await listShopifyCatalog({
    requester: {
      async request(input) {
        requestBody = input.body;
        return {
          data: {
            data: {
              products: {
                nodes: [product],
                pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
              },
            },
          },
          status: 200,
          requestId: null,
          apiCallLimit: null,
        };
      },
    },
    links: {
      async findMany(_workspaceId, gids) {
        batchCalls += 1;
        assert.deepEqual(gids, [product.id]);
        return new Map();
      },
    },
  }, 'workspace-1', { search: '', importState: 'ALL' });
  assert.equal(batchCalls, 1);
  assert.equal(result.products.length, 1);
  assert.equal(result.pageInfo.endCursor, 'cursor-1');
  assert.equal(JSON.stringify(requestBody).includes('descriptionHtml'), false);
  assert.equal(SHOPIFY_CATALOG_PRODUCTS_QUERY.includes('inventory'), false);
});

test('maps GraphQL throttling without exposing raw errors', async () => {
  await assert.rejects(
    listShopifyCatalog({
      requester: {
        async request() {
          return {
            data: { errors: [{ message: 'raw secret', extensions: { code: 'THROTTLED' } }] },
            status: 200,
            requestId: null,
            apiCallLimit: null,
          };
        },
      },
      links: { async findMany() { return new Map(); } },
    }, 'workspace-1', { search: '', importState: 'ALL' }),
    (error: unknown) => (
      error instanceof Error
      && error.message === 'Shopify is temporarily throttling requests.'
      && !error.message.includes('raw secret')
    ),
  );
});

