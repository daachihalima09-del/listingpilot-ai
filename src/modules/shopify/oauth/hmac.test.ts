import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildShopifyHmacMessage,
  verifyShopifyOAuthHmac,
} from './hmac.ts';

const secret = 'shopify-secret';

function signedParameters(entries: Array<[string, string]>): URLSearchParams {
  const parameters = new URLSearchParams(entries);
  parameters.set(
    'hmac',
    createHmac('sha256', secret)
      .update(buildShopifyHmacMessage(parameters))
      .digest('hex'),
  );
  return parameters;
}

test('verifies a valid Shopify HMAC', () => {
  assert.equal(verifyShopifyOAuthHmac(signedParameters([
    ['shop', 'example.myshopify.com'],
    ['code', 'authorization code'],
    ['timestamp', '1785000000'],
  ]), secret), true);
});

test('rejects invalid and malformed HMAC values safely', () => {
  const invalid = signedParameters([['shop', 'example.myshopify.com']]);
  invalid.set('hmac', '0'.repeat(64));
  assert.equal(verifyShopifyOAuthHmac(invalid, secret), false);
  invalid.set('hmac', 'not-hex');
  assert.equal(verifyShopifyOAuthHmac(invalid, secret), false);
});

test('sorts and Shopify-encodes callback parameters before signing', () => {
  const parameters = new URLSearchParams([
    ['state', 'state_value'],
    ['code', 'value with spaces'],
    ['hmac', 'ignored'],
    ['shop', 'example.myshopify.com'],
  ]);
  assert.equal(
    buildShopifyHmacMessage(parameters),
    'code=value+with+spaces&shop=example.myshopify.com&state=state_value',
  );
});
