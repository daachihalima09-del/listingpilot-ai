import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyConfig } from '../config.ts';
import { buildShopifyAuthorizationUrl } from './authorization-url.ts';

const config: ShopifyConfig = {
  apiKey: 'shopify-api-key',
  apiSecret: 'shopify-api-secret',
  appUrl: 'https://listingpilot.example',
  apiVersion: '2026-07',
  scopes: ['read_products', 'write_products'],
  tokenEncryptionKey: 'not-used-by-this-foundation-test-value',
};

test('builds a canonical Shopify authorization URL', () => {
  const result = new URL(buildShopifyAuthorizationUrl(config, {
    shopDomain: 'example-store.myshopify.com',
    state: 'secure-state-value',
  }));

  assert.equal(
    result.origin,
    'https://example-store.myshopify.com',
  );
  assert.equal(result.pathname, '/admin/oauth/authorize');
  assert.equal(result.searchParams.get('client_id'), 'shopify-api-key');
  assert.equal(
    result.searchParams.get('scope'),
    'read_products,write_products',
  );
  assert.equal(
    result.searchParams.get('redirect_uri'),
    'https://listingpilot.example/api/shopify/callback',
  );
  assert.equal(result.searchParams.get('state'), 'secure-state-value');
  assert.equal(result.searchParams.size, 4);
});
