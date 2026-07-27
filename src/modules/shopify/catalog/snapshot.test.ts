import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShopifyProductSnapshot, stripExternalHtml } from './snapshot.ts';

export const detailedProductFixture = {
  id: 'gid://shopify/Product/123',
  legacyResourceId: '123',
  title: 'Example',
  handle: 'example',
  descriptionHtml: '<p>Safe</p><script>alert(1)</script>',
  vendor: 'Vendor',
  productType: 'Type',
  status: 'ACTIVE',
  tags: ['one'],
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
  publishedAt: null,
  seo: { title: 'SEO', description: 'Description' },
  options: [{ id: 'option-1', name: 'Title', position: 1, values: ['Default'] }],
  variants: { nodes: [{
    id: 'variant-1',
    legacyResourceId: '456',
    title: 'Default',
    sku: 'SKU',
    barcode: null,
    price: '10.00',
    compareAtPrice: null,
    position: 1,
    selectedOptions: [{ name: 'Title', value: 'Default' }],
    image: null,
  }] },
  media: { nodes: [{
    __typename: 'MediaImage',
    id: 'media-1',
    alt: 'Example',
    mediaContentType: 'IMAGE',
    image: { url: 'https://cdn.shopify.com/example.jpg' },
  }] },
  metafields: { nodes: [
    { id: 'm1', namespace: 'listingpilot_content', key: 'seo_title', type: 'single_line_text_field', value: 'SEO' },
    { id: 'm2', namespace: 'private', key: 'secret', type: 'single_line_text_field', value: 'ignore' },
  ] },
};

test('normalizes bounded variants, media, and only supported metafields', () => {
  const snapshot = normalizeShopifyProductSnapshot(
    detailedProductFixture,
    '2026-07',
    new Date('2026-07-27T12:00:00.000Z'),
  );
  assert.equal(snapshot.product.variants[0].sku, 'SKU');
  assert.equal(snapshot.product.media[0].url, 'https://cdn.shopify.com/example.jpg');
  assert.equal(snapshot.product.metafields.length, 1);
  assert.equal(JSON.stringify(snapshot).includes('inventory'), false);
});

test('renders external HTML as safe plain text', () => {
  assert.equal(stripExternalHtml(detailedProductFixture.descriptionHtml), 'Safe');
});

