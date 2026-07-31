import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NormalizedVariant } from '../domain/types.ts';
import {
  evaluateRuleIssues,
  issuesForRule,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function variant(overrides: Partial<NormalizedVariant> = {}): NormalizedVariant {
  return { ...validRuleProductFixture().variants[0], ...overrides };
}

test('product with no variants is critical', () => {
  const issue = issuesForRule(
    evaluateRuleIssues({ products: [validRuleProductFixture({ variants: [] })] }),
    'product.variants.missing',
  )[0];
  assert.equal(issue.severity, 'CRITICAL');
  assert.deepEqual(issue.affectedFields, ['variants']);
});

test('missing and whitespace SKUs are detected per variant', () => {
  for (const sku of [undefined, '   ']) {
    const issues = evaluateRuleIssues({
      products: [validRuleProductFixture({ variants: [variant({ sku })] })],
    });
    assert.equal(issuesForRule(issues, 'variant.sku.missing').length, 1);
  }
});

test('duplicate SKU is detected within one product', () => {
  const product = validRuleProductFixture({
    variants: [
      variant({ id: 'v1', sku: 'DUPLICATE' }),
      variant({ id: 'v2', sku: 'DUPLICATE' }),
    ],
  });
  assert.equal(issuesForRule(
    evaluateRuleIssues({ products: [product] }),
    'variant.sku.duplicate',
  ).length, 1);
});

test('duplicate SKU is detected across supplied products only', () => {
  const issues = evaluateRuleIssues({
    products: [
      validRuleProductFixture({ id: 'p1', variants: [variant({ id: 'v1', sku: 'DUPLICATE' })] }),
      validRuleProductFixture({ id: 'p2', variants: [variant({ id: 'v2', sku: 'DUPLICATE' })] }),
    ],
  });
  const duplicate = issuesForRule(issues, 'variant.sku.duplicate')[0];
  assert.deepEqual(duplicate.affectedProductIds, ['p1', 'p2']);
  assert.deepEqual(duplicate.affectedVariantIds, ['v1', 'v2']);
});

test('SKU comparison respects case sensitivity configuration', () => {
  const product = validRuleProductFixture({
    variants: [
      variant({ id: 'v1', sku: 'Case-SKU' }),
      variant({ id: 'v2', sku: 'case-sku' }),
    ],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [product] }), 'variant.sku.duplicate').length, 1);
  assert.equal(issuesForRule(evaluateRuleIssues({
    products: [product],
    configuration: { duplicateDetection: { caseSensitive: true } },
  }), 'variant.sku.duplicate').length, 0);
});

test('missing barcodes are ignored by duplicate comparison', () => {
  const product = validRuleProductFixture({
    variants: [
      variant({ id: 'v1', barcode: undefined }),
      variant({ id: 'v2', barcode: '' }),
    ],
  });
  assert.equal(issuesForRule(
    evaluateRuleIssues({ products: [product] }),
    'variant.barcode.duplicate',
  ).length, 0);
});

test('duplicate barcode is detected within and across products', () => {
  const products = [
    validRuleProductFixture({ id: 'p1', variants: [variant({ id: 'v1', barcode: '123' })] }),
    validRuleProductFixture({ id: 'p2', variants: [variant({ id: 'v2', barcode: '123' })] }),
  ];
  assert.equal(issuesForRule(evaluateRuleIssues({ products }), 'variant.barcode.duplicate').length, 1);
});

test('empty option names and values are independently detected', () => {
  const product = validRuleProductFixture({
    variants: [variant({ options: { '': 'Value', Size: ' ' } })],
  });
  const issues = evaluateRuleIssues({ products: [product] });
  assert.equal(issuesForRule(issues, 'variant.option.name.empty').length, 1);
  assert.equal(issuesForRule(issues, 'variant.option.value.empty').length, 1);
});

test('missing price is detected without throwing', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ variants: [variant({ price: undefined })] })],
  });
  assert.equal(issuesForRule(issues, 'variant.price.missing').length, 1);
});

test('negative price uses exact decimal comparison', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ variants: [variant({ price: '-0.0001' })] })],
  });
  assert.equal(issuesForRule(issues, 'variant.price.negative').length, 1);
});

test('valid high-precision decimal price is accepted without floating point conversion', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      variants: [variant({ price: '999999999999999999.123456789', compareAtPrice: undefined })],
    })],
  });
  assert.equal(issuesForRule(issues, 'variant.price.invalid').length, 0);
  assert.equal(issuesForRule(issues, 'variant.price.negative').length, 0);
});

test('malformed regular and compare-at prices become issues', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      variants: [variant({ price: '19,99', compareAtPrice: 'not-money' })],
    })],
  });
  assert.equal(issuesForRule(issues, 'variant.price.invalid').length, 1);
  assert.equal(issuesForRule(issues, 'variant.compare_at.invalid').length, 1);
});

test('negative compare-at price is detected', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      variants: [variant({ price: '10.00', compareAtPrice: '-1.00' })],
    })],
  });
  assert.equal(issuesForRule(issues, 'variant.compare_at.negative').length, 1);
});

test('compare-at price below selling price is detected exactly', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      variants: [variant({ price: '10.000000000000000001', compareAtPrice: '10.000000000000000000' })],
    })],
  });
  assert.equal(issuesForRule(issues, 'variant.compare_at.below_price').length, 1);
});

test('equal compare-at price is a low-severity ineffective-price warning', () => {
  const issue = issuesForRule(evaluateRuleIssues({
    products: [validRuleProductFixture({
      variants: [variant({ price: '10.0', compareAtPrice: '10.00' })],
    })],
  }), 'variant.compare_at.equal_price')[0];
  assert.equal(issue.severity, 'LOW');
  assert.equal(issuesForRule([issue], 'variant.compare_at.below_price').length, 0);
});

test('duplicate stable variant IDs become an issue instead of context failure', () => {
  const product = validRuleProductFixture({
    variants: [
      variant({ id: 'same-id', sku: 'SKU-1' }),
      variant({ id: 'same-id', sku: 'SKU-2' }),
    ],
  });
  const duplicate = issuesForRule(
    evaluateRuleIssues({ products: [product] }),
    'variant.id.duplicate',
  )[0];
  assert.equal(duplicate.severity, 'HIGH');
  assert.deepEqual(duplicate.affectedFields, ['variants.0.id', 'variants.1.id']);
});

test('catalog duplicate checks can be disabled while within-product duplicates remain active', () => {
  const products = [
    validRuleProductFixture({ id: 'p1', variants: [variant({ id: 'v1', sku: 'SAME' })] }),
    validRuleProductFixture({ id: 'p2', variants: [variant({ id: 'v2', sku: 'SAME' })] }),
  ];
  assert.equal(issuesForRule(evaluateRuleIssues({
    products,
    configuration: { catalog: { enableCrossProductChecks: false } },
  }), 'variant.sku.duplicate').length, 0);
  const within = validRuleProductFixture({
    variants: [variant({ id: 'v1', sku: 'SAME' }), variant({ id: 'v2', sku: 'SAME' })],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({
    products: [within],
    configuration: { catalog: { enableCrossProductChecks: false } },
  }), 'variant.sku.duplicate').length, 1);
});
