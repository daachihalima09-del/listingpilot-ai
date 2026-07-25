import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateShopifyOAuthState,
  shopifyOAuthStateCookieName,
  shopifyOAuthStateCookieOptions,
} from './state.ts';

test('generates unique cryptographically random OAuth state values', () => {
  const first = generateShopifyOAuthState();
  const second = generateShopifyOAuthState();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test('stores OAuth state in a short-lived protected cookie', () => {
  assert.equal(
    shopifyOAuthStateCookieName(true),
    '__Secure-listingpilot.shopify-oauth-state',
  );
  assert.deepEqual(shopifyOAuthStateCookieOptions(true), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/api/shopify',
    maxAge: 600,
  });
});
