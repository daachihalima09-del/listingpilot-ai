import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getShopifyVariantViewState,
} from './variant-view-state.ts';

const ready = {
  configured: true,
  connected: true,
  hasPublishedProduct: true,
  canManage: true,
};

test('derives no-product, read-only, disconnected, and ready states', () => {
  assert.equal(getShopifyVariantViewState({
    ...ready,
    configured: false,
  }), 'CONFIGURATION_MISSING');
  assert.equal(getShopifyVariantViewState({
    ...ready,
    connected: false,
  }), 'NOT_CONNECTED');
  assert.equal(getShopifyVariantViewState({
    ...ready,
    hasPublishedProduct: false,
  }), 'PRODUCT_NOT_PUBLISHED');
  assert.equal(getShopifyVariantViewState({
    ...ready,
    canManage: false,
  }), 'READ_ONLY');
  assert.equal(getShopifyVariantViewState(ready), 'READY');
});
