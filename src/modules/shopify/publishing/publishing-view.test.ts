import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTrustedShopifyAdminProductUrl,
  getShopifyPublishingAvailability,
} from './publishing-view.ts';

const baseContext = {
  configured: true,
  connected: true,
  canManage: true,
  publication: null,
  adminUrl: null,
};

test('derives configuration, disconnected, read-only, and ready panel states', () => {
  assert.equal(getShopifyPublishingAvailability({
    ...baseContext,
    configured: false,
  }), 'CONFIGURATION_MISSING');
  assert.equal(getShopifyPublishingAvailability({
    ...baseContext,
    connected: false,
  }), 'NOT_CONNECTED');
  assert.equal(getShopifyPublishingAvailability({
    ...baseContext,
    canManage: false,
  }), 'READ_ONLY');
  assert.equal(getShopifyPublishingAvailability(baseContext), 'READY');
});

test('derives the published state with safe metadata', () => {
  assert.equal(getShopifyPublishingAvailability({
    ...baseContext,
    publication: {
      id: '123456789',
      title: 'Alpine Jacket',
      handle: 'alpine-jacket',
      status: 'DRAFT',
      firstPublishedAt: '2026-07-26T12:00:00.000Z',
      lastPublishedAt: '2026-07-26T12:00:00.000Z',
    },
  }), 'PUBLISHED');
});

test('builds admin links only from canonical domains and numeric product IDs', () => {
  assert.equal(
    buildTrustedShopifyAdminProductUrl(
      'sample-store.myshopify.com',
      '123456789',
    ),
    'https://sample-store.myshopify.com/admin/products/123456789',
  );
  assert.equal(
    buildTrustedShopifyAdminProductUrl('evil.example', '123456789'),
    null,
  );
  assert.equal(
    buildTrustedShopifyAdminProductUrl(
      'sample-store.myshopify.com',
      '../settings',
    ),
    null,
  );
});
