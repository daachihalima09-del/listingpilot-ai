import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NormalizedMedia } from '../domain/types.ts';
import {
  evaluateRuleIssues,
  issuesForRule,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function media(overrides: Partial<NormalizedMedia> = {}): NormalizedMedia {
  return { ...validRuleProductFixture().media[0], ...overrides };
}

test('product with no media is detected', () => {
  assert.equal(issuesForRule(
    evaluateRuleIssues({ products: [validRuleProductFixture({ media: [] })] }),
    'product.media.missing',
  ).length, 1);
});

test('image missing alt text is detected with a deterministic field path', () => {
  const issue = issuesForRule(evaluateRuleIssues({
    products: [validRuleProductFixture({ media: [media({ altText: ' ' })] })],
  }), 'media.image.alt.missing')[0];
  assert.deepEqual(issue.affectedFields, ['media.0.altText']);
});

test('video without alt text does not fail by default', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ media: [media({ type: 'VIDEO', altText: undefined })] })],
  });
  assert.equal(issuesForRule(issues, 'media.image.alt.missing').length, 0);
});

test('image alt-text requirement can be disabled', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ media: [media({ altText: undefined })] })],
    configuration: { media: { requireAltTextForImages: false } },
  });
  assert.equal(issuesForRule(issues, 'media.image.alt.missing').length, 0);
});

test('duplicate media URL is detected within one product', () => {
  const product = validRuleProductFixture({
    media: [
      media({ id: 'm1', position: 0, url: 'https://example.test/a.jpg' }),
      media({ id: 'm2', position: 1, url: 'https://example.test/a.jpg' }),
    ],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [product] }), 'media.url.duplicate').length, 1);
});

test('duplicate media URL is detected across supplied products', () => {
  const products = [
    validRuleProductFixture({ id: 'p1', media: [media({ id: 'm1', url: 'https://example.test/a.jpg' })] }),
    validRuleProductFixture({ id: 'p2', media: [media({ id: 'm2', url: 'https://example.test/a.jpg' })] }),
  ];
  const issue = issuesForRule(evaluateRuleIssues({ products }), 'media.url.duplicate')[0];
  assert.deepEqual(issue.affectedProductIds, ['p1', 'p2']);
});

test('media URL normalization removes fragments by default', () => {
  const product = validRuleProductFixture({
    media: [
      media({ id: 'm1', position: 0, url: 'https://EXAMPLE.test/a.jpg#first' }),
      media({ id: 'm2', position: 1, url: 'https://example.test/a.jpg#second' }),
    ],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [product] }), 'media.url.duplicate').length, 1);
});

test('configured media URL normalization may remove query strings', () => {
  const product = validRuleProductFixture({
    media: [
      media({ id: 'm1', position: 0, url: 'https://example.test/a.jpg?v=1' }),
      media({ id: 'm2', position: 1, url: 'https://example.test/a.jpg?v=2' }),
    ],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [product] }), 'media.url.duplicate').length, 0);
  assert.equal(issuesForRule(evaluateRuleIssues({
    products: [product],
    configuration: { duplicateDetection: { mediaUrlNormalization: 'REMOVE_QUERY_AND_FRAGMENT' } },
  }), 'media.url.duplicate').length, 1);
});

test('negative and non-integer zero-based media positions are invalid', () => {
  for (const position of [-1, 1.5]) {
    const issues = evaluateRuleIssues({
      products: [validRuleProductFixture({ media: [media({ position })] })],
    });
    assert.equal(issuesForRule(issues, 'media.position.invalid').length, 1);
  }
});

test('duplicate media positions are compared only within a product', () => {
  const one = validRuleProductFixture({
    id: 'p1',
    media: [media({ id: 'm1', position: 0 }), media({ id: 'm2', position: 0, url: 'https://example.test/b.jpg' })],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [one] }), 'media.position.duplicate').length, 1);
  const separate = [
    validRuleProductFixture({ id: 'p1', media: [media({ id: 'm1', position: 0 })] }),
    validRuleProductFixture({ id: 'p2', media: [media({ id: 'm2', position: 0, url: 'https://example.test/b.jpg' })] }),
  ];
  assert.equal(issuesForRule(evaluateRuleIssues({ products: separate }), 'media.position.duplicate').length, 0);
});

test('broken width and height metadata are detected independently', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ media: [media({ width: 0, height: -1 })] })],
  });
  assert.equal(issuesForRule(issues, 'media.width.invalid').length, 1);
  assert.equal(issuesForRule(issues, 'media.height.invalid').length, 1);
});

test('partial dimensions are detected', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ media: [media({ width: 100, height: undefined })] })],
  });
  assert.equal(issuesForRule(issues, 'media.dimensions.partial').length, 1);
});

test('image without URL or source reference is detected', () => {
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({
      media: [media({ url: undefined, sourceReference: undefined })],
    })],
  });
  assert.equal(issuesForRule(issues, 'media.image.source.missing').length, 1);
});

test('empty URLs are ignored by duplicate URL checks', () => {
  const product = validRuleProductFixture({
    media: [
      media({ id: 'm1', position: 0, url: undefined }),
      media({ id: 'm2', position: 1, url: undefined }),
    ],
  });
  assert.equal(issuesForRule(evaluateRuleIssues({ products: [product] }), 'media.url.duplicate').length, 0);
});
