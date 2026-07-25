import assert from 'node:assert/strict';
import test from 'node:test';
import { parseShopifyCallbackQuery } from './callback-query.ts';
import { ShopifyCallbackError } from '../types/errors.ts';

const state = 'a'.repeat(43);
const now = new Date('2026-07-25T12:00:00.000Z');

test('validates required callback parameters and normalizes the shop', () => {
  const timestamp = Math.floor(now.getTime() / 1_000);
  const query = parseShopifyCallbackQuery(
    `https://app.test/api/shopify/callback?code=code&hmac=${'a'.repeat(64)}&shop=Example&state=${state}&timestamp=${timestamp}`,
    now,
  );
  assert.equal(query.shop, 'example.myshopify.com');
});

test('rejects missing, duplicate, and stale callback parameters', () => {
  for (const search of [
    `?hmac=${'a'.repeat(64)}&shop=example&state=${state}`,
    `?code=one&code=two&hmac=${'a'.repeat(64)}&shop=example&state=${state}`,
    `?code=one&hmac=${'a'.repeat(64)}&shop=example&state=${state}&timestamp=1`,
  ]) {
    assert.throws(
      () => parseShopifyCallbackQuery(
        `https://app.test/api/shopify/callback${search}`,
        now,
      ),
      ShopifyCallbackError,
    );
  }
});
