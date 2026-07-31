import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NeutralConfidenceStrategy, confidenceLevel } from './confidence.ts';
import { contextFixture, evidenceFixture } from '../testing/fixtures.ts';

test('neutral confidence returns a bounded, explainable neutral value', () => {
  const context = contextFixture();
  const result = new NeutralConfidenceStrategy('test-v1').calculate({
    evidence: [evidenceFixture()],
    detectorWeight: 0.8,
    ruleWeight: 0.7,
    officialSourceWeight: 1,
    freshnessFactor: 0.9,
    disagreementPenalty: -0.1,
    thresholds: context.confidenceThresholds,
    metadata: {},
  });
  assert.equal(result.value, 0.5);
  assert.equal(result.strategyVersion, 'test-v1');
  assert.equal(result.factors.length, 5);
});

test('merchant override is validated and remains explainable', () => {
  const context = contextFixture();
  const result = new NeutralConfidenceStrategy().calculate({
    evidence: [],
    merchantOverride: 0.9,
    thresholds: context.confidenceThresholds,
    metadata: {},
  });
  assert.equal(result.value, 0.9);
  assert.equal(result.level, 'VERY_HIGH');
  assert.equal(result.factors[0].code, 'MERCHANT_OVERRIDE');
});

test('confidence levels follow caller-supplied thresholds', () => {
  const thresholds = contextFixture().confidenceThresholds;
  assert.equal(confidenceLevel(0.2, thresholds), 'VERY_LOW');
  assert.equal(confidenceLevel(0.4, thresholds), 'LOW');
  assert.equal(confidenceLevel(0.6, thresholds), 'MEDIUM');
  assert.equal(confidenceLevel(0.8, thresholds), 'HIGH');
  assert.equal(confidenceLevel(0.81, thresholds), 'VERY_HIGH');
});
