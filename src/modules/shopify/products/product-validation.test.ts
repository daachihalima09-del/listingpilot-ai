import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseShopifyCreatedProduct,
  shopifyProductCreateInputSchema,
} from './product-validation.ts';
import { buildShopifyProductCreatePayload } from './product-payload.ts';

test('validates product input and builds the server-controlled Shopify payload', () => {
  const input = shopifyProductCreateInputSchema.parse({
    title: '  Alpine Jacket  ',
    descriptionHtml: '<p>Weather-ready shell.</p>',
    vendor: ' ListingPilot ',
    productType: ' Jackets ',
    tags: ['outdoor', ' waterproof ', 'outdoor'],
    status: 'ACTIVE',
  });
  assert.deepEqual(buildShopifyProductCreatePayload(input), {
    product: {
      title: 'Alpine Jacket',
      body_html: '<p>Weather-ready shell.</p>',
      vendor: 'ListingPilot',
      product_type: 'Jackets',
      tags: 'outdoor, waterproof',
      status: 'active',
    },
  });
});

test('rejects malformed and unsupported product fields', () => {
  for (const value of [
    {
      title: '',
      tags: [],
      status: 'ACTIVE',
    },
    {
      title: 'Product',
      tags: 'not-an-array',
      status: 'DRAFT',
    },
    {
      title: 'Product',
      tags: [],
      status: 'ARCHIVED',
    },
    {
      title: 'Product',
      tags: [],
      status: 'ACTIVE',
      variants: [{ price: '10.00' }],
    },
  ]) {
    assert.equal(
      shopifyProductCreateInputSchema.safeParse(value).success,
      false,
    );
  }
});

test('validates and normalizes the client-safe Shopify product response', () => {
  assert.deepEqual(parseShopifyCreatedProduct({
    product: {
      id: 987654321,
      title: 'Alpine Jacket',
      handle: 'alpine-jacket',
      status: 'draft',
      body_html: '<p>Must not reach the client DTO.</p>',
    },
  }), {
    id: '987654321',
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    status: 'DRAFT',
  });
  assert.throws(() => parseShopifyCreatedProduct({
    product: { id: 1, title: 'Missing fields' },
  }));
});
