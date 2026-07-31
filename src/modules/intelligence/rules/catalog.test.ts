import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateRuleIssues,
  issuesForRule,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function catalogProducts() {
  const base = validRuleProductFixture();
  return [
    validRuleProductFixture({
      id: 'p1',
      title: 'Shared Product',
      description: 'A shared catalog description with enough content for deterministic duplicate comparison and length validation.',
      variants: [{ ...base.variants[0], id: 'v1', sku: 'SHARED-SKU', barcode: 'SHARED-BARCODE' }],
      media: [{ ...base.media[0], id: 'm1', url: 'https://example.test/shared.jpg' }],
      seo: { ...base.seo, handle: 'shared-handle' },
    }),
    validRuleProductFixture({
      id: 'p2',
      title: ' shared   product ',
      description: ' a SHARED catalog description with enough content for deterministic duplicate comparison and length validation. ',
      variants: [{ ...base.variants[0], id: 'v2', sku: 'shared-sku', barcode: 'shared-barcode' }],
      media: [{ ...base.media[0], id: 'm2', url: 'https://EXAMPLE.test/shared.jpg#other' }],
      seo: { ...base.seo, handle: ' SHARED-HANDLE ' },
    }),
  ];
}

test('catalog duplicate titles and handles use configured normalization', () => {
  const issues = evaluateRuleIssues({ products: catalogProducts() });
  assert.equal(issuesForRule(issues, 'catalog.product.title.duplicate').length, 1);
  assert.equal(issuesForRule(issues, 'catalog.handle.duplicate').length, 1);
});

test('catalog duplicate SKU and barcode are owned by variant rules', () => {
  const issues = evaluateRuleIssues({ products: catalogProducts() });
  assert.equal(issuesForRule(issues, 'variant.sku.duplicate').length, 1);
  assert.equal(issuesForRule(issues, 'variant.barcode.duplicate').length, 1);
  assert.equal(issues.some(({ code }) => code.startsWith('CATALOG_SKU')), false);
});

test('catalog duplicate description is owned by the description rule', () => {
  const issues = evaluateRuleIssues({ products: catalogProducts() });
  assert.equal(issuesForRule(issues, 'product.description.duplicate').length, 1);
});

test('catalog duplicate media is owned by the media URL rule', () => {
  const issues = evaluateRuleIssues({ products: catalogProducts() });
  assert.equal(issuesForRule(issues, 'media.url.duplicate').length, 1);
});

test('duplicates are limited to products supplied in selected scope', () => {
  const products = catalogProducts();
  const selectedIssues = evaluateRuleIssues({
    products: [products[0]],
    context: { analysisScope: 'SELECTED_PRODUCTS' },
  });
  for (const ruleId of [
    'catalog.product.title.duplicate',
    'catalog.handle.duplicate',
    'product.description.duplicate',
    'variant.sku.duplicate',
    'variant.barcode.duplicate',
    'media.url.duplicate',
  ]) {
    assert.equal(issuesForRule(selectedIssues, ruleId).length, 0, ruleId);
  }
});

test('cross-product catalog checks can be disabled', () => {
  const issues = evaluateRuleIssues({
    products: catalogProducts(),
    configuration: { catalog: { enableCrossProductChecks: false } },
  });
  for (const ruleId of [
    'catalog.product.title.duplicate',
    'catalog.handle.duplicate',
    'product.description.duplicate',
    'variant.sku.duplicate',
    'variant.barcode.duplicate',
    'media.url.duplicate',
  ]) {
    assert.equal(issuesForRule(issues, ruleId).length, 0, ruleId);
  }
});

test('empty catalog duplicate fields are ignored', () => {
  const base = validRuleProductFixture();
  const products = [
    validRuleProductFixture({
      id: 'p1',
      title: '',
      description: undefined,
      variants: [{ ...base.variants[0], id: 'v1', sku: '', barcode: undefined }],
      media: [{ ...base.media[0], id: 'm1', url: undefined }],
      seo: { ...base.seo, handle: '' },
    }),
    validRuleProductFixture({
      id: 'p2',
      title: ' ',
      description: ' ',
      variants: [{ ...base.variants[0], id: 'v2', sku: ' ', barcode: '' }],
      media: [{ ...base.media[0], id: 'm2', url: undefined }],
      seo: { ...base.seo, handle: ' ' },
    }),
  ];
  const issues = evaluateRuleIssues({ products });
  for (const ruleId of [
    'catalog.product.title.duplicate',
    'catalog.handle.duplicate',
    'product.description.duplicate',
    'variant.sku.duplicate',
    'variant.barcode.duplicate',
    'media.url.duplicate',
  ]) {
    assert.equal(issuesForRule(issues, ruleId).length, 0, ruleId);
  }
});

test('each duplicate group emits one canonical issue code', () => {
  const issues = evaluateRuleIssues({ products: catalogProducts() });
  for (const ruleId of [
    'catalog.product.title.duplicate',
    'catalog.handle.duplicate',
    'product.description.duplicate',
    'variant.sku.duplicate',
    'variant.barcode.duplicate',
    'media.url.duplicate',
  ]) {
    assert.equal(issuesForRule(issues, ruleId).length, 1, ruleId);
  }
});

test('case-sensitive catalog comparison distinguishes title and handle casing', () => {
  const issues = evaluateRuleIssues({
    products: catalogProducts(),
    configuration: { duplicateDetection: { caseSensitive: true } },
  });
  assert.equal(issuesForRule(issues, 'catalog.product.title.duplicate').length, 0);
  assert.equal(issuesForRule(issues, 'catalog.handle.duplicate').length, 0);
});
