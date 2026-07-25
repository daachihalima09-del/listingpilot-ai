import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeShopDomain, shopDomainSchema } from './shop-domain.ts';

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
