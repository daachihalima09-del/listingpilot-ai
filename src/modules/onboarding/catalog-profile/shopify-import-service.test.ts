import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyAdminApiRequester,
  ShopifyAdminRequest,
} from '../../shopify/admin/admin-api-client-core.ts';
import { ShopifyAdminApiError } from '../../shopify/admin/errors.ts';
import { MerchantCatalogProfileError } from './errors.ts';
import {
  MERCHANT_CATALOG_COLLECTIONS_QUERY,
} from './shopify-import-graphql.ts';
import { importMerchantCatalogValues } from './shopify-import-service.ts';

function response(data: unknown) {
  return {
    data,
    status: 200,
    requestId: null,
    apiCallLimit: null,
  };
}

test('imports editable collections, product types and exact Shopify vendors', async () => {
  const requests: ShopifyAdminRequest[] = [];
  const requester: ShopifyAdminApiRequester = {
    async request(input) {
      requests.push(input);
      const body = input.body as {
        query: string;
        variables: { after: string | null };
      };
      if (body.query === MERCHANT_CATALOG_COLLECTIONS_QUERY) {
        return response({
          data: {
            collections: {
              nodes: [{ title: ' Sale ' }, { title: 'New  Arrivals' }],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        });
      }
      return response({
        data: {
          products: {
            nodes: [
              { productType: 'Desk', vendor: 'Maker Co.' },
              { productType: ' desk ', vendor: 'Maker  Co.' },
              { productType: '', vendor: null },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    },
  };
  const values = await importMerchantCatalogValues(requester);
  assert.deepEqual(values, {
    collections: ['New Arrivals', 'Sale'],
    productTypes: ['Desk'],
    vendors: ['Maker Co.'],
  });
  assert.equal(requests.length, 2);
  assert.equal(requests.every((request) => request.method === 'POST'), true);
  assert.equal(requests.every((request) => request.retrySafe === true), true);
  assert.equal(
    requests.some((request) => JSON.stringify(request.body).includes('mutation')),
    false,
  );
});

test('paginates Shopify collections without changing their store', async () => {
  const cursors: Array<string | null> = [];
  const requester: ShopifyAdminApiRequester = {
    async request(input) {
      const body = input.body as {
        query: string;
        variables: { after: string | null };
      };
      if (body.query === MERCHANT_CATALOG_COLLECTIONS_QUERY) {
        cursors.push(body.variables.after);
        return response({
          data: {
            collections: body.variables.after
              ? {
                  nodes: [{ title: 'Second' }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                }
              : {
                  nodes: [{ title: 'First' }],
                  pageInfo: { hasNextPage: true, endCursor: 'next-page' },
                },
          },
        });
      }
      return response({
        data: {
          products: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      });
    },
  };
  const values = await importMerchantCatalogValues(requester);
  assert.deepEqual(cursors, [null, 'next-page']);
  assert.deepEqual(values.collections, ['First', 'Second']);
});

test('maps Shopify credential failures to a safe connection error', async () => {
  await assert.rejects(
    importMerchantCatalogValues({
      async request() {
        throw new ShopifyAdminApiError({
          code: 'SHOPIFY_ADMIN_UNAUTHORIZED',
          message: 'raw upstream credential detail',
        });
      },
    }),
    (error: unknown) => (
      error instanceof MerchantCatalogProfileError
      && error.code === 'SHOPIFY_NOT_CONNECTED'
      && !error.message.includes('raw upstream')
    ),
  );
});

test('rejects malformed Shopify responses without exposing response details', async () => {
  await assert.rejects(
    importMerchantCatalogValues({
      async request() {
        return response({
          errors: [{ message: 'sensitive Shopify detail' }],
        });
      },
    }),
    (error: unknown) => (
      error instanceof MerchantCatalogProfileError
      && error.code === 'SHOPIFY_UNAVAILABLE'
      && !error.message.includes('sensitive')
    ),
  );
});
