import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluateRuleIssues,
  issuesForRule,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function count(ruleId: string, products = [validRuleProductFixture()]): number {
  return issuesForRule(evaluateRuleIssues({ products }), ruleId).length;
}

test('missing and whitespace product titles produce the stable title issue', () => {
  assert.equal(count('product.title.missing', [validRuleProductFixture({ title: '' })]), 1);
  assert.equal(count('product.title.missing', [validRuleProductFixture({ title: '   ' })]), 1);
});

test('valid product title does not produce a missing-title issue', () => {
  assert.equal(count('product.title.missing'), 0);
});

test('missing brand, product type, handle, and status are independently detected', () => {
  const product = validRuleProductFixture({
    vendor: ' ',
    productType: undefined,
    status: undefined,
    seo: { ...validRuleProductFixture().seo, handle: '' },
  });
  const issues = evaluateRuleIssues({ products: [product] });
  for (const ruleId of [
    'product.vendor.missing',
    'product.type.missing',
    'product.handle.missing',
    'product.status.missing',
  ]) {
    assert.equal(issuesForRule(issues, ruleId).length, 1, ruleId);
  }
});

test('identity issue field paths and rule metadata are deterministic', () => {
  const issue = issuesForRule(
    evaluateRuleIssues({ products: [validRuleProductFixture({ title: '' })] }),
    'product.title.missing',
  )[0];
  assert.deepEqual(issue.affectedFields, ['title']);
  assert.equal(issue.code, 'PRODUCT_TITLE_MISSING');
  assert.equal(issue.metadata.ruleVersion, '1.0.0');
  assert.equal(issue.confidence?.factors[0].code, 'DETERMINISTIC_RULE_MATCH');
});

test('absent description produces missing but not empty description', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ description: undefined })],
  });
  assert.equal(issuesForRule(issues, 'product.description.missing').length, 1);
  assert.equal(issuesForRule(issues, 'product.description.empty').length, 0);
});

test('present whitespace or empty HTML produces empty but not missing description', () => {
  for (const description of ['   ', '<p> </p>']) {
    const issues = evaluateRuleIssues({
      products: [validRuleProductFixture({ description })],
    });
    assert.equal(issuesForRule(issues, 'product.description.empty').length, 1);
    assert.equal(issuesForRule(issues, 'product.description.missing').length, 0);
  }
});

test('description length uses deterministic visible text and configurable minimum', () => {
  const product = validRuleProductFixture({ description: '<p>Short text</p>' });
  assert.equal(issuesForRule(
    evaluateRuleIssues({ products: [product], configuration: { description: { minimumLength: 20 } } }),
    'product.description.too_short',
  ).length, 1);
  assert.equal(issuesForRule(
    evaluateRuleIssues({ products: [product], configuration: { description: { minimumLength: 10 } } }),
    'product.description.too_short',
  ).length, 0);
});

test('valid description does not produce missing, empty, or short issues', () => {
  const issues = evaluateRuleIssues({ products: [validRuleProductFixture()] });
  for (const ruleId of [
    'product.description.missing',
    'product.description.empty',
    'product.description.too_short',
  ]) {
    assert.equal(issuesForRule(issues, ruleId).length, 0);
  }
});

test('duplicate descriptions use configured normalization and map grouping', () => {
  const first = validRuleProductFixture({ id: 'p1', description: 'Same   DESCRIPTION with enough content to pass the minimum threshold and compare semantically.' });
  const second = validRuleProductFixture({ id: 'p2', description: ' same description with enough content to pass the minimum threshold and compare semantically. ' });
  const issues = evaluateRuleIssues({ products: [first, second] });
  const duplicate = issuesForRule(issues, 'product.description.duplicate');
  assert.equal(duplicate.length, 1);
  assert.deepEqual(duplicate[0].affectedProductIds, ['p1', 'p2']);
});

test('exact description comparison preserves case and whitespace differences', () => {
  const first = validRuleProductFixture({ id: 'p1', description: 'A sufficiently long Description that should not equal the differently cased form below.' });
  const second = validRuleProductFixture({ id: 'p2', description: 'a sufficiently long description that should not equal the differently cased form below.' });
  const issues = evaluateRuleIssues({
    products: [first, second],
    configuration: { description: { duplicateComparisonMode: 'EXACT' } },
  });
  assert.equal(issuesForRule(issues, 'product.description.duplicate').length, 0);
});

test('missing and empty descriptions are ignored by duplicate checks', () => {
  const issues = evaluateRuleIssues({
    products: [
      validRuleProductFixture({ id: 'p1', description: undefined }),
      validRuleProductFixture({ id: 'p2', description: ' ' }),
    ],
  });
  assert.equal(issuesForRule(issues, 'product.description.duplicate').length, 0);
});
