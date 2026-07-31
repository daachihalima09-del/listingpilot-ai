import assert from 'node:assert/strict';
import test from 'node:test';
import {
  merchantCatalogProfileInputSchema,
  normalizeMerchantCatalogValue,
} from './validation.ts';

test('normalizes whitespace while preserving the merchant order', () => {
  const result = merchantCatalogProfileInputSchema.parse({
    setupMode: 'MANUAL',
    collections: ['  Summer   Sale ', 'New Arrivals'],
    productTypes: ['  Coffee\tTable '],
    vendors: ['Acme\nSupply'],
  });
  assert.deepEqual(result, {
    setupMode: 'MANUAL',
    collections: ['Summer Sale', 'New Arrivals'],
    productTypes: ['Coffee Table'],
    vendors: ['Acme Supply'],
  });
  assert.equal(normalizeMerchantCatalogValue('  A \n B  '), 'A B');
});

test('rejects empty and whitespace-only catalog entries', () => {
  for (const value of ['', '  ', '\n\t']) {
    assert.equal(merchantCatalogProfileInputSchema.safeParse({
      setupMode: 'MANUAL',
      collections: [value],
      productTypes: [],
      vendors: [],
    }).success, false);
  }
});

test('rejects duplicates after case and whitespace normalization', () => {
  const result = merchantCatalogProfileInputSchema.safeParse({
    setupMode: 'SHOPIFY_IMPORT',
    collections: ['Home  Office', ' home office '],
    productTypes: ['Desk', 'desk'],
    vendors: ['Northwind', 'NORTHWIND'],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.error.issues.map((issue) => issue.path), [
      ['collections', 1],
      ['productTypes', 1],
      ['vendors', 1],
    ]);
  }
});

test('allows empty sections and rejects unsupported setup modes', () => {
  assert.equal(merchantCatalogProfileInputSchema.safeParse({
    setupMode: 'MANUAL',
    collections: [],
    productTypes: [],
    vendors: [],
  }).success, true);
  assert.equal(merchantCatalogProfileInputSchema.safeParse({
    setupMode: 'AUTOMATIC',
    collections: [],
    productTypes: [],
    vendors: [],
  }).success, false);
});
