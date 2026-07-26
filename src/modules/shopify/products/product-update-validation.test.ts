import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseShopifyProductState,
  shopifyProductIdSchema,
  shopifyProductUpdateInputSchema,
} from './product-update-validation.ts';

test('validates Shopify product IDs strictly', () => {
  assert.equal(shopifyProductIdSchema.parse('987654321'), '987654321');
  for (const id of ['', '0', '-1', '1.5', 'gid://shopify/Product/1', '1'.repeat(21)]) {
    assert.equal(shopifyProductIdSchema.safeParse(id).success, false);
  }
});

test('requires at least one supported update field', () => {
  for (const input of [
    {},
    { status: 'ARCHIVED' },
    { variants: [] },
    { title: 'Product', images: [] },
  ]) {
    assert.equal(shopifyProductUpdateInputSchema.safeParse(input).success, false);
  }
  assert.deepEqual(shopifyProductUpdateInputSchema.parse({
    vendor: '',
    tags: [],
  }), {
    vendor: '',
    tags: [],
  });
});

test('validates current Shopify state required for comparison', () => {
  assert.deepEqual(parseShopifyProductState({
    product: {
      id: 987654321,
      title: 'Alpine Jacket',
      handle: 'alpine-jacket',
      body_html: null,
      vendor: 'ListingPilot',
      product_type: 'Jackets',
      tags: 'Outdoor, Waterproof',
      status: 'active',
      updated_at: '2026-07-26T12:00:00Z',
    },
  }), {
    id: '987654321',
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    descriptionHtml: '',
    vendor: 'ListingPilot',
    productType: 'Jackets',
    tags: ['Outdoor', 'Waterproof'],
    status: 'ACTIVE',
    updatedAt: '2026-07-26T12:00:00Z',
  });
  assert.throws(() => parseShopifyProductState({
    product: { id: 1, title: 'Incomplete' },
  }));
});
