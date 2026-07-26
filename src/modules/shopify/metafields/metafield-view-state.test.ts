import assert from 'node:assert/strict';
import test from 'node:test';
import { getShopifyMetafieldViewState } from './metafield-view-state.ts';

const ready = {
  configured: true,
  connected: true,
  hasPublishedProduct: true,
  canManage: true,
  hasMappedData: true,
};

test('derives configuration, disconnected, product, read-only, empty, and ready states', () => {
  assert.equal(getShopifyMetafieldViewState({
    ...ready,
    configured: false,
  }), 'CONFIGURATION_MISSING');
  assert.equal(getShopifyMetafieldViewState({
    ...ready,
    connected: false,
  }), 'NOT_CONNECTED');
  assert.equal(getShopifyMetafieldViewState({
    ...ready,
    hasPublishedProduct: false,
  }), 'PRODUCT_NOT_PUBLISHED');
  assert.equal(getShopifyMetafieldViewState({
    ...ready,
    canManage: false,
  }), 'READ_ONLY');
  assert.equal(getShopifyMetafieldViewState({
    ...ready,
    hasMappedData: false,
  }), 'NO_MAPPED_DATA');
  assert.equal(getShopifyMetafieldViewState(ready), 'READY');
});

