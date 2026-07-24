import assert from 'node:assert/strict';
import test from 'node:test';
import { getSafeCallbackPath } from './redirects.ts';

test('safe callback paths retain internal path, query, and hash values', () => {
  assert.equal(
    getSafeCallbackPath('/workspace/products?filter=review#item'),
    '/workspace/products?filter=review#item',
  );
});

test('external, protocol-relative, malformed, and auth-loop callbacks are rejected', () => {
  for (const callback of [
    'https://attacker.example',
    '//attacker.example/path',
    '/\\attacker.example',
    '/sign-in',
    '/sign-up?callbackUrl=/catalog',
    '',
  ]) {
    assert.equal(getSafeCallbackPath(callback), '/');
  }
});
