import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptShopifyAccessToken,
  encryptShopifyAccessToken,
} from './token-encryption-core.ts';

const key = Buffer.alloc(32, 1).toString('base64');
const wrongKey = Buffer.alloc(32, 2).toString('base64');
const token = 'shpat_secret_access_token';

test('encrypts and decrypts Shopify tokens without exposing plaintext', () => {
  const encrypted = encryptShopifyAccessToken(token, key);
  assert.equal(decryptShopifyAccessToken(encrypted, key), token);
  assert.equal(encrypted.includes(token), false);
  assert.deepEqual(
    Object.keys(JSON.parse(encrypted)),
    ['v', 'alg', 'iv', 'tag', 'ciphertext'],
  );
});

test('uses a unique IV for every token encryption', () => {
  assert.notEqual(
    encryptShopifyAccessToken(token, key),
    encryptShopifyAccessToken(token, key),
  );
});

test('rejects wrong keys and malformed encrypted payloads', () => {
  const encrypted = encryptShopifyAccessToken(token, key);
  assert.throws(() => decryptShopifyAccessToken(encrypted, wrongKey));
  assert.throws(() => decryptShopifyAccessToken('{"v":1}', key));
  assert.throws(() => decryptShopifyAccessToken('not-json', key));
});
