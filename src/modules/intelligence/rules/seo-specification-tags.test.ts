import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NormalizedSpecification } from '../domain/types.ts';
import {
  evaluateRuleIssues,
  issuesForRule,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function specification(overrides: Partial<NormalizedSpecification> = {}): NormalizedSpecification {
  return { ...validRuleProductFixture().specifications[0], ...overrides };
}

test('missing SEO title and description are detected without length duplicates', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      seo: { ...validRuleProductFixture().seo, title: ' ', description: undefined },
    })],
  });
  assert.equal(issuesForRule(issues, 'seo.title.missing').length, 1);
  assert.equal(issuesForRule(issues, 'seo.description.missing').length, 1);
  assert.equal(issuesForRule(issues, 'seo.title.too_short').length, 0);
  assert.equal(issuesForRule(issues, 'seo.description.too_short').length, 0);
});

test('SEO title and description too-short rules use configurable thresholds', () => {
  const product = validRuleProductFixture({
    seo: { ...validRuleProductFixture().seo, title: 'Short title', description: 'Short description' },
  });
  const issues = evaluateRuleIssues({
    products: [product],
    configuration: {
      seoTitle: { minimumLength: 20 },
      seoDescription: { minimumLength: 30 },
    },
  });
  assert.equal(issuesForRule(issues, 'seo.title.too_short').length, 1);
  assert.equal(issuesForRule(issues, 'seo.description.too_short').length, 1);
});

test('SEO title and description too-long rules use configurable thresholds', () => {
  const product = validRuleProductFixture({
    seo: { ...validRuleProductFixture().seo, title: '123456', description: '123456789' },
  });
  const issues = evaluateRuleIssues({
    products: [product],
    configuration: {
      seoTitle: { minimumLength: 0, maximumLength: 5 },
      seoDescription: { minimumLength: 0, maximumLength: 8 },
    },
  });
  assert.equal(issuesForRule(issues, 'seo.title.too_long').length, 1);
  assert.equal(issuesForRule(issues, 'seo.description.too_long').length, 1);
});

test('SEO values at exact configured minimum and maximum are valid', () => {
  for (const value of ['12345', '1234567890']) {
    const issues = evaluateRuleIssues({
      products: [validRuleProductFixture({
        seo: { ...validRuleProductFixture().seo, title: value, description: value },
      })],
      configuration: {
        seoTitle: { minimumLength: 5, maximumLength: 10 },
        seoDescription: { minimumLength: 5, maximumLength: 10 },
      },
    });
    assert.equal(issuesForRule(issues, 'seo.title.too_short').length, 0);
    assert.equal(issuesForRule(issues, 'seo.title.too_long').length, 0);
    assert.equal(issuesForRule(issues, 'seo.description.too_short').length, 0);
    assert.equal(issuesForRule(issues, 'seo.description.too_long').length, 0);
  }
});

test('missing specification key becomes an issue', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ specifications: [specification({ key: ' ' })] })],
  });
  assert.equal(issuesForRule(issues, 'specification.key.missing').length, 1);
});

test('missing specification value requires both raw and normalized values to be blank', () => {
  const missing = evaluateRuleIssues({
    products: [validRuleProductFixture({
      specifications: [specification({ rawValue: ' ', normalizedValue: undefined })],
    })],
  });
  assert.equal(issuesForRule(missing, 'specification.value.missing').length, 1);
  const valid = evaluateRuleIssues({
    products: [validRuleProductFixture({
      specifications: [specification({ rawValue: undefined, normalizedValue: 0 })],
    })],
  });
  assert.equal(issuesForRule(valid, 'specification.value.missing').length, 0);
});

test('exact duplicate specifications are detected inside one product', () => {
  const spec = specification({ namespace: 'generic', key: 'material' });
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ specifications: [spec, { ...spec, rawValue: 'Iron' }] })],
  });
  assert.equal(issuesForRule(issues, 'specification.duplicate').length, 1);
});

test('normalized duplicate keys respect namespace and avoid exact-rule overlap', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      specifications: [
        specification({ namespace: 'generic', key: 'Material' }),
        specification({ namespace: 'generic', key: ' material ' }),
        specification({ namespace: 'other', key: 'material' }),
      ],
    })],
  });
  assert.equal(issuesForRule(issues, 'specification.key.normalized_duplicate').length, 1);
  assert.equal(issuesForRule(issues, 'specification.duplicate').length, 0);
});

test('blank units and units on unsupported value types are detected', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      specifications: [
        specification({ key: 'one', unit: ' ', valueType: 'DECIMAL' }),
        specification({ key: 'two', unit: 'cm', valueType: 'BOOLEAN' }),
      ],
    })],
  });
  assert.equal(issuesForRule(issues, 'specification.unit.blank').length, 1);
  assert.equal(issuesForRule(issues, 'specification.unit.unsupported').length, 1);
});

test('valid generic numeric specification with a unit produces no specification issue', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      specifications: [specification({
        key: 'length',
        rawValue: '10 cm',
        normalizedValue: '10',
        valueType: 'DECIMAL',
        unit: 'cm',
      })],
    })],
  });
  assert.equal(issues.filter(({ category }) => category === 'SPECIFICATION').length, 0);
});

test('empty and duplicate tags are detected', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ tags: ['one', ' ', 'one'] })],
  });
  assert.equal(issuesForRule(issues, 'tag.empty').length, 1);
  assert.equal(issuesForRule(issues, 'tag.duplicate').length, 1);
});

test('tag duplicate comparison is case-insensitive and whitespace-normalized by default', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ tags: ['  Product   Tag ', 'product tag'] })],
  });
  assert.equal(issuesForRule(issues, 'tag.duplicate').length, 1);
});

test('tag duplicate comparison can be case-sensitive', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ tags: ['Tag', 'tag'] })],
    configuration: { duplicateDetection: { caseSensitive: true } },
  });
  assert.equal(issuesForRule(issues, 'tag.duplicate').length, 0);
});

test('excessive tag count uses raw stored count and custom maximum', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ tags: ['one', 'one', ''] })],
    configuration: { tags: { maximumCount: 2 } },
  });
  const excessive = issuesForRule(issues, 'tag.count.excessive')[0];
  assert.equal(excessive.metadata.actualCount, 3);
  assert.equal(excessive.metadata.countPolicy, 'RAW_STORED_COUNT');
});

test('valid tags at the configured maximum produce no tag issue', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ tags: ['one', 'two'] })],
    configuration: { tags: { maximumCount: 2 } },
  });
  assert.equal(issuesForRule(issues, 'tag.empty').length, 0);
  assert.equal(issuesForRule(issues, 'tag.duplicate').length, 0);
  assert.equal(issuesForRule(issues, 'tag.count.excessive').length, 0);
});
