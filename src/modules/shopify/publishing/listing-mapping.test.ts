import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SHOPIFY_PUBLISH_STATUS,
  isMappedShopifyProductValid,
  mapListingToShopifyProduct,
  validateMappedShopifyProduct,
} from './listing-mapping.ts';

const source = {
  listing: {
    title: '  Alpine Jacket  ',
    description: '<p>Weatherproof &amp; warm.</p>',
    tags: ' winter, outdoor, winter, ',
    seoTitle: 'Excluded SEO title',
  },
  product: {
    brand: 'Northwind',
    inventory: 200,
  },
};

test('defaults Shopify publishing to DRAFT', () => {
  assert.equal(DEFAULT_SHOPIFY_PUBLISH_STATUS, 'DRAFT');
});

test('maps only supported listing fields and preserves description HTML', () => {
  const mapped = mapListingToShopifyProduct(source, 'DRAFT');
  assert.deepEqual(mapped, {
    title: 'Alpine Jacket',
    descriptionHtml: '<p>Weatherproof &amp; warm.</p>',
    vendor: 'Northwind',
    productType: '',
    tags: ['winter', 'outdoor'],
    status: 'DRAFT',
  });
  assert.equal('seoTitle' in mapped, false);
  assert.equal('inventory' in mapped, false);
});

test('merchant selection maps ACTIVE without adding unsupported data', () => {
  assert.equal(mapListingToShopifyProduct(source, 'ACTIVE').status, 'ACTIVE');
});

test('rejects invalid mapped listings with the existing product schemas', () => {
  const invalid = mapListingToShopifyProduct({
    ...source,
    listing: { ...source.listing, title: ' ' },
  }, 'DRAFT');
  assert.equal(isMappedShopifyProductValid(invalid, 'create'), false);
  assert.throws(() => validateMappedShopifyProduct(invalid, 'create'));
});
