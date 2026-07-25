import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeShopDomain,
  shopDomainSchema,
  shopifyConnectInputSchema,
} from './shop-domain.ts';

test('normalizes Shopify store names and canonical HTTPS domains', () => {
  assert.equal(
    normalizeShopDomain('  Listing-Pilot  '),
    'listing-pilot.myshopify.com',
  );
  assert.equal(
    normalizeShopDomain('HTTPS://Example-Store.MyShopify.Com/'),
    'example-store.myshopify.com',
  );
  assert.equal(
    normalizeShopDomain('example-store.myshopify.com'),
    'example-store.myshopify.com',
  );
});

test('rejects invalid, ambiguous, and non-Shopify domains', () => {
  for (const domain of [
    '',
    'http://example.myshopify.com',
    'https://example.myshopify.com/admin',
    'https://example.myshopify.com?state=unsafe',
    'example.com',
    '-example',
    'example-',
    'example..myshopify.com',
    'example.myshopify.com.evil.test',
  ]) {
    assert.equal(
      shopDomainSchema.safeParse(domain).success,
      false,
      `${domain || '<empty>'} should be rejected`,
    );
  }
});

test('connect input accepts only a shop domain resolved through existing normalization', () => {
  assert.deepEqual(shopifyConnectInputSchema.parse({ shop: 'Sample-Store' }), {
    shop: 'sample-store.myshopify.com',
  });
  assert.equal(shopifyConnectInputSchema.safeParse({
    shop: 'sample-store',
    workspaceId: '11111111-1111-4111-8111-111111111111',
  }).success, false);
  assert.equal(shopifyConnectInputSchema.safeParse({
    shop: 'sample-store',
    scopes: ['write_products'],
  }).success, false);
});
