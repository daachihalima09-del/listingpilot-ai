import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntelligenceDomainError } from './errors.ts';
import {
  createIntelligenceContext,
  createIntelligenceIssue,
  createIntelligenceRecommendation,
  createNormalizedProduct,
  validateConfidence,
  validateEvidence,
} from './validation.ts';
import {
  contextFixture,
  evidenceFixture,
  issueFixture,
  productFixture,
  recommendationFixture,
} from '../testing/fixtures.ts';

test('creates a valid immutable normalized product with source-independent models', () => {
  const input = productFixture();
  const product = createNormalizedProduct(input);
  assert.equal(product.id, 'product-1');
  assert.equal(product.specifications[0].normalizedValue, 'steel');
  assert.equal(Object.isFrozen(product), true);
  assert.equal(Object.isFrozen(product.variants), true);
  assert.equal(Object.isFrozen(product.variants[0]), true);
});

test('rejects invalid stable product and variant identities', () => {
  assert.throws(
    () => createNormalizedProduct(productFixture({ id: '' })),
    (error: unknown) => error instanceof IntelligenceDomainError && error.code === 'INVALID_IDENTITY',
  );
  assert.throws(
    () => createNormalizedProduct(productFixture({
      variants: [{ ...productFixture().variants[0], id: '' }],
    })),
    /stable non-empty identity/,
  );
});

test('rejects duplicate product IDs in an analysis context', () => {
  assert.throws(
    () => createIntelligenceContext(contextFixture({
      products: [productFixture(), productFixture()],
    })),
    (error: unknown) => error instanceof IntelligenceDomainError && error.code === 'DUPLICATE_PRODUCT_ID',
  );
});

test('immutable copies do not share mutable nested input state', () => {
  const input = productFixture();
  const product = createNormalizedProduct(input);
  (input.attributes as Record<string, unknown>).changed = true;
  assert.equal(product.attributes.changed, undefined);
  assert.throws(() => {
    (product.attributes as Record<string, unknown>).changed = true;
  });
});

test('monetary values remain exact strings and malformed values reach rule evaluation', () => {
  const product = createNormalizedProduct(productFixture());
  assert.equal(product.variants[0].price, '19.9900');
  assert.equal(typeof product.variants[0].price, 'string');
  const malformed = createNormalizedProduct(productFixture({
    variants: [{ ...productFixture().variants[0], price: '19,99' }],
  }));
  assert.equal(malformed.variants[0].price, '19,99');
});

test('specifications preserve raw, normalized, unit, namespace, and evidence structure', () => {
  const product = createNormalizedProduct(productFixture({
    specifications: [{
      key: 'length',
      label: 'Length',
      rawValue: '10 cm',
      normalizedValue: '10',
      unit: 'cm',
      namespace: 'dimensions',
      valueType: 'DECIMAL',
      evidenceIds: ['evidence-1'],
    }],
  }));
  assert.deepEqual(product.specifications[0], {
    key: 'length',
    label: 'Length',
    rawValue: '10 cm',
    normalizedValue: '10',
    unit: 'cm',
    namespace: 'dimensions',
    valueType: 'DECIMAL',
    evidenceIds: ['evidence-1'],
  });
});

test('validates evidence identity, claim, freshness, and timestamp', () => {
  assert.doesNotThrow(() => validateEvidence(evidenceFixture()));
  assert.throws(() => validateEvidence(evidenceFixture({ claim: '' })), /describe a claim/);
  assert.throws(() => validateEvidence(evidenceFixture({ freshness: 2 })), /freshness/);
  assert.throws(() => validateEvidence(evidenceFixture({ retrievedAt: 'invalid' })), /valid timestamp/);
});

test('validates confidence bounds and explainable factors', () => {
  assert.doesNotThrow(() => validateConfidence({
    value: 0.5,
    level: 'MEDIUM',
    strategyVersion: '1.0.0',
    factors: [{
      code: 'TEST',
      label: 'Test factor',
      contribution: 0,
      explanation: 'Neutral.',
      metadata: {},
    }],
  }));
  assert.throws(() => validateConfidence({
    value: 1.1,
    level: 'VERY_HIGH',
    strategyVersion: '1.0.0',
    factors: [],
  }), /between zero and one/);
});

test('validates issue scope and affected fields', () => {
  assert.doesNotThrow(() => createIntelligenceIssue(issueFixture()));
  assert.throws(
    () => createIntelligenceIssue(issueFixture({ affectedFields: [] })),
    /field-scoped issue/,
  );
});

test('validates recommendation issue references and proposed fields', () => {
  assert.doesNotThrow(() => createIntelligenceRecommendation(
    recommendationFixture(),
    new Set(['issue-1']),
  ));
  assert.throws(
    () => createIntelligenceRecommendation(recommendationFixture({ issueIds: ['unknown'] }), new Set(['issue-1'])),
    /unknown issue/,
  );
  assert.throws(
    () => createIntelligenceRecommendation(recommendationFixture({
      proposedValues: [{ field: '', value: 'x' }],
    })),
    /requires a field/,
  );
});

test('analysis scope validation permits empty catalogs but constrains selected scopes', () => {
  assert.doesNotThrow(() => createIntelligenceContext(contextFixture({ products: [] })));
  assert.throws(
    () => createIntelligenceContext(contextFixture({
      analysisScope: 'SINGLE_PRODUCT',
      products: [],
    })),
    /exactly one product/,
  );
  assert.throws(
    () => createIntelligenceContext(contextFixture({
      analysisScope: 'SELECTED_PRODUCTS',
      products: [],
    })),
    /at least one product/,
  );
});
