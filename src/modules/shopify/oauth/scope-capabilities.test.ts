import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateShopifyScopeCapabilities } from './scope-capabilities.ts';

const requiredScopes = [
  'read_products',
  'write_products',
  'read_files',
  'write_files',
];

for (const grantedScopes of [
  ['write_products', 'write_files'],
  ['read_products', 'write_products', 'read_files', 'write_files'],
]) {
  test(`accepts effective commercial capabilities from ${grantedScopes.join(', ')}`, () => {
    const result = evaluateShopifyScopeCapabilities({
      requiredScopes,
      grantedScopes,
    });
    assert.equal(result.satisfied, true);
    assert.deepEqual(result.missingRequiredScopes, []);
  });
}

for (const grantedScopes of [
  ['read_products', 'read_files'],
  ['write_products'],
  ['write_files'],
  ['read_products', 'write_files'],
  ['write_products', 'read_files'],
  ['read_orders', 'write_orders'],
  [],
]) {
  test(`rejects insufficient commercial capabilities from ${grantedScopes.join(', ') || 'empty scopes'}`, () => {
    const result = evaluateShopifyScopeCapabilities({
      requiredScopes,
      grantedScopes,
    });
    assert.equal(result.satisfied, false);
    assert.ok(result.missingRequiredScopes.length > 0);
  });
}

test('does not ignore an unrelated additional configured requirement', () => {
  const result = evaluateShopifyScopeCapabilities({
    requiredScopes: [...requiredScopes, 'read_orders'],
    grantedScopes: ['write_products', 'write_files'],
  });
  assert.equal(result.satisfied, false);
  assert.deepEqual(result.missingRequiredScopes, ['read_orders']);
});
