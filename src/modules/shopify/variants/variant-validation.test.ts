import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareDecimalStrings,
  shopifyVariantConfigurationSchema,
} from './variant-validation.ts';

function singleVariant() {
  return {
    version: 0,
    options: [],
    variants: [{
      optionValues: [],
      price: '19.99',
      compareAtPrice: '24.99',
      sku: 'JACKET-BASE',
      barcode: '123456789012',
    }],
  };
}

function multiVariant() {
  return {
    version: 1,
    options: [
      { name: 'Size', values: ['Small', 'Large'] },
      { name: 'Color', values: ['Blue', 'Black'] },
    ],
    variants: [
      {
        optionValues: [
          { name: 'Size', value: 'Small' },
          { name: 'Color', value: 'Blue' },
        ],
        price: '19.99',
        compareAtPrice: null,
        sku: null,
        barcode: null,
      },
      {
        optionValues: [
          { name: 'Size', value: 'Large' },
          { name: 'Color', value: 'Black' },
        ],
        price: '21.00',
        compareAtPrice: '25.00',
        sku: 'L-BLK',
        barcode: null,
      },
    ],
  };
}

test('validates a single default variant with pricing fields', () => {
  const parsed = shopifyVariantConfigurationSchema.parse(singleVariant());
  assert.equal(parsed.variants[0].combinationKey, '__default__');
  assert.equal(parsed.variants[0].price, '19.99');
});

test('validates multiple options and preserves stable ordering', () => {
  const parsed = shopifyVariantConfigurationSchema.parse(multiVariant());
  assert.deepEqual(parsed.options.map(({ name }) => name), ['Size', 'Color']);
  assert.deepEqual(
    parsed.variants[0].optionValues,
    [
      { name: 'Size', value: 'Small' },
      { name: 'Color', value: 'Blue' },
    ],
  );
});

test('rejects invalid precision, negatives, and locale-formatted money', () => {
  for (const price of ['1.999', '-1.00', '1,000.00', '01.00', '']) {
    const input = singleVariant();
    input.variants[0].price = price;
    assert.equal(
      shopifyVariantConfigurationSchema.safeParse(input).success,
      false,
      price,
    );
  }
});

test('compares decimal strings without floating-point arithmetic', () => {
  assert.equal(compareDecimalStrings('10.00', '10.0'), 0);
  assert.equal(compareDecimalStrings('100.00', '99.99'), 1);
  assert.equal(compareDecimalStrings('0.01', '0.10'), -1);
});

test('requires compare-at price to exceed the price', () => {
  const input = singleVariant();
  input.variants[0].compareAtPrice = '19.99';
  assert.equal(shopifyVariantConfigurationSchema.safeParse(input).success, false);
});

test('rejects duplicate option names case-insensitively', () => {
  const input = multiVariant();
  input.options[1].name = ' size ';
  assert.equal(shopifyVariantConfigurationSchema.safeParse(input).success, false);
});

test('rejects duplicate option values case-insensitively', () => {
  const input = multiVariant();
  input.options[0].values = ['Small', ' small '];
  assert.equal(shopifyVariantConfigurationSchema.safeParse(input).success, false);
});

test('rejects duplicate variant combinations', () => {
  const input = multiVariant();
  input.variants[1].optionValues = structuredClone(
    input.variants[0].optionValues,
  );
  assert.equal(shopifyVariantConfigurationSchema.safeParse(input).success, false);
});

test('rejects combinations with missing or unknown option values', () => {
  const missing = multiVariant();
  missing.variants[0].optionValues.pop();
  assert.equal(shopifyVariantConfigurationSchema.safeParse(missing).success, false);

  const unknown = multiVariant();
  unknown.variants[0].optionValues[0].value = 'Medium';
  assert.equal(shopifyVariantConfigurationSchema.safeParse(unknown).success, false);
});

test('rejects browser-supplied Shopify variant IDs and unknown fields', () => {
  const input = singleVariant() as ReturnType<typeof singleVariant> & {
    shopifyVariantId?: string;
  };
  (input.variants[0] as typeof input.variants[0] & {
    shopifyVariantId: string;
  }).shopifyVariantId = '999999';
  assert.equal(shopifyVariantConfigurationSchema.safeParse(input).success, false);
});
