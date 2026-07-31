import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detailedProductFixture } from '../catalog/snapshot.test.ts';
import { normalizeShopifyProductSnapshot } from '../catalog/snapshot.ts';
import { generateShopifyChangeReview } from './review-engine.ts';

test('current ListingPilot variant and metafield configurations form the local state', () => {
  const baseline = normalizeShopifyProductSnapshot(
    detailedProductFixture,
    '2026-07',
    new Date('2026-07-27T12:00:00.000Z'),
  );
  const review = generateShopifyChangeReview({
    projectId: 'project',
    workspaceId: 'workspace',
    shopifyStoreId: 'store',
    baseline,
    remote: baseline,
    project: {
      generatedListing: null,
      seoData: null,
      shopifyVariantConfiguration: {
        variants: [{
          id: 'local-variant',
          shopifyVariantId: '456',
          optionValues: [{ name: 'Title', value: 'Default' }],
          price: '12.00',
          compareAtPrice: null,
          sku: 'UPDATED-SKU',
          barcode: null,
          position: 1,
          active: true,
        }],
      },
      shopifyMetafieldConfiguration: {
        metafields: [{
          namespace: 'listingpilot_content',
          key: 'seo_title',
          type: 'single_line_text_field',
          serializedValue: 'Updated SEO',
          enabled: true,
        }],
      },
      shopifyImageConfiguration: null,
    },
  });

  assert.equal(
    review.fields.find(({ fieldPath }) => fieldPath === 'variants.variant-1.price')?.classification,
    'LOCAL_CHANGED',
  );
  assert.equal(
    review.fields.find(({ fieldPath }) => fieldPath === 'variants.variant-1.sku')?.localValue,
    'UPDATED-SKU',
  );
  assert.equal(
    review.fields.find(({ fieldPath }) => fieldPath === 'metafields.listingpilot_content.seo_title')?.classification,
    'LOCAL_CHANGED',
  );
});

test('local resources without stable Shopify identity are blocked', () => {
  const baseline = normalizeShopifyProductSnapshot(detailedProductFixture, '2026-07');
  const review = generateShopifyChangeReview({
    projectId: 'project',
    workspaceId: 'workspace',
    shopifyStoreId: 'store',
    baseline,
    remote: baseline,
    project: {
      generatedListing: null,
      seoData: null,
      shopifyVariantConfiguration: {
        variants: [{
          id: 'new-local-variant',
          shopifyVariantId: null,
          optionValues: { Title: 'New' },
          price: '15.00',
          compareAtPrice: null,
          sku: null,
          barcode: null,
          position: 2,
          active: true,
        }],
      },
      shopifyMetafieldConfiguration: null,
      shopifyImageConfiguration: null,
    },
  });

  const field = review.fields.find(({ fieldPath }) => fieldPath.includes('new-local-variant'));
  assert.equal(field?.classification, 'BLOCKED');
  assert.deepEqual(field?.availableDecisions, ['SKIP']);
});
