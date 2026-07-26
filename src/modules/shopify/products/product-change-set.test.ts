import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateShopifyProductChangeSet } from './product-change-set.ts';
import type { ShopifyProductState } from './product-update-validation.ts';

const current: ShopifyProductState = {
  id: '987654321',
  title: 'Alpine Jacket',
  handle: 'alpine-jacket',
  descriptionHtml: '<p>Original</p>',
  vendor: 'ListingPilot',
  productType: 'Jackets',
  tags: ['Outdoor', 'Waterproof'],
  status: 'DRAFT',
  updatedAt: '2026-07-26T12:00:00Z',
};

test('calculates a minimal single-field update', () => {
  assert.deepEqual(calculateShopifyProductChangeSet(current, {
    title: 'Alpine Shell',
  }), {
    changedFields: ['title'],
    payload: {
      product: {
        id: '987654321',
        title: 'Alpine Shell',
      },
    },
  });
});

test('includes only changed fields in a multi-field update', () => {
  assert.deepEqual(calculateShopifyProductChangeSet(current, {
    title: 'Alpine Jacket',
    vendor: 'New Vendor',
    descriptionHtml: '<p>Updated</p>',
    status: 'ACTIVE',
  }), {
    changedFields: ['descriptionHtml', 'vendor', 'status'],
    payload: {
      product: {
        id: '987654321',
        body_html: '<p>Updated</p>',
        vendor: 'New Vendor',
        status: 'active',
      },
    },
  });
});

test('preserves omitted fields and supports intentional empty optional values', () => {
  const result = calculateShopifyProductChangeSet(current, {
    descriptionHtml: '',
    vendor: '',
    productType: '',
  });
  assert.deepEqual(result.changedFields, [
    'descriptionHtml',
    'vendor',
    'productType',
  ]);
  assert.deepEqual(result.payload.product, {
    id: '987654321',
    body_html: '',
    vendor: '',
    product_type: '',
  });
  assert.equal('title' in result.payload.product, false);
  assert.equal('tags' in result.payload.product, false);
});

test('tag comparison ignores order, case, whitespace, and duplicates', () => {
  assert.deepEqual(calculateShopifyProductChangeSet(current, {
    tags: [' waterproof ', 'OUTDOOR', 'outdoor'],
  }), {
    changedFields: [],
    payload: { product: { id: '987654321' } },
  });
  assert.deepEqual(calculateShopifyProductChangeSet(current, {
    tags: ['Waterproof', 'New', 'Outdoor'],
  }), {
    changedFields: ['tags'],
    payload: {
      product: {
        id: '987654321',
        tags: 'New, Outdoor, Waterproof',
      },
    },
  });
});
