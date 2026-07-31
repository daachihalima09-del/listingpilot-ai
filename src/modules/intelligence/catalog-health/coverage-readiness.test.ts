import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import {
  catalogHealthInputFixture,
  healthProductFixture,
  healthTruthFindingFixture,
} from '../testing/catalog-health-fixtures.ts';
import {
  aggregatePublishingReadiness,
  createCatalogHealthBundle,
  mostRestrictiveReadiness,
} from './index.ts';

function report(input: Parameters<typeof catalogHealthInputFixture>[0] = {}) {
  return createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder.build(catalogHealthInputFixture(input));
}

test('full upstream and evidence coverage produce full assessment confidence', () => {
  const result = report();
  assert.equal(result.coverageSummary.completenessPercentage, 100);
  assert.equal(result.assessmentConfidence, 100);
  assert.deepEqual(result.coverageSummary.missingCapabilities, []);
});

test('partial capability coverage is visible and lowers confidence', () => {
  const result = report({
    includeDetective: false,
    includeRecommendationPlan: false,
  });
  assert.deepEqual(result.coverageSummary.missingCapabilities, [
    'ai-detective',
    'recommendation-intelligence',
  ]);
  assert.equal(result.assessmentConfidence < 100, true);
  assert.equal(result.overallHealthStatus, 'INSUFFICIENT_ANALYSIS');
});

test('missing Product Truth is reported and does not silently become healthy', () => {
  const result = report({ includeTruth: false });
  assert.equal(result.coverageSummary.missingCapabilities.includes('product-truth'), true);
  assert.equal(result.productHealthSummaries[0].publishingReadiness, 'UNKNOWN');
  assert.equal(result.productsWithIncompleteAnalysis, 1);
});

test('missing Detective output is reported independently', () => {
  const result = report({ includeDetective: false });
  assert.equal(result.coverageSummary.productsWithDetectiveEvaluation, 0);
  assert.equal(result.coverageSummary.missingCapabilities.includes('ai-detective'), true);
});

test('missing Recommendation Plan is reported independently', () => {
  const result = report({ includeRecommendationPlan: false });
  assert.equal(result.coverageSummary.productsWithRecommendationPlans, 0);
  assert.equal(result.recommendationSummary.totalRecommendations, 0);
});

test('provenance gaps lower confidence without changing the health score into confidence', () => {
  const complete = report();
  const incomplete = report({
    truthFindings: [healthTruthFindingFixture('product-1', {
      evidenceSummary: {
        evidenceCount: 2,
        independentSourceCount: 1,
        strongestAuthority: 'RETAILER_STRUCTURED',
        missingProvenanceCount: 2,
      },
    })],
  });
  assert.equal(incomplete.coverageSummary.provenanceCoveragePercentage, 0);
  assert.equal(incomplete.assessmentConfidence < complete.assessmentConfidence, true);
  assert.equal(incomplete.overallHealthScore, complete.overallHealthScore);
});

test('high-looking dimension scores can coexist with low assessment confidence', () => {
  const result = report({
    includeTruth: false,
    includeDetective: false,
    includeRecommendationPlan: false,
  });
  assert.equal(result.healthDimensions.every(({ score }) => score === 100), true);
  assert.equal(result.assessmentConfidence < 50, true);
  assert.equal(result.overallHealthStatus, 'INSUFFICIENT_ANALYSIS');
});

test('empty catalog returns a bounded insufficient-analysis report', () => {
  const result = report({ products: [] });
  assert.equal(result.productsAnalyzed, 0);
  assert.equal(result.overallHealthScore, 0);
  assert.equal(result.assessmentConfidence, 0);
  assert.equal(result.overallHealthStatus, 'INSUFFICIENT_ANALYSIS');
  assert.equal(result.readinessSummary.publishReadyPercentage, 0);
});

test('readiness aggregation reports every state and exact percentages', () => {
  const result = aggregatePublishingReadiness([
    'READY',
    'READY_WITH_WARNINGS',
    'REVIEW_RECOMMENDED',
    'REVIEW_REQUIRED',
    'BLOCKED',
    'UNKNOWN',
  ]);
  assert.equal(result.publishReadyCount, 2);
  assert.equal(result.publishReadyPercentage, 33.33);
  assert.equal(result.blockedPercentage, 16.67);
  assert.equal(result.unknownCount, 1);
});

test('blocked readiness always takes precedence over conflicting states', () => {
  assert.equal(mostRestrictiveReadiness([
    'READY',
    'REVIEW_REQUIRED',
    'UNKNOWN',
    'BLOCKED',
  ]), 'BLOCKED');
});

test('coverage counts evidence product-by-product', () => {
  const products = [
    healthProductFixture('p1'),
    healthProductFixture('p2', { evidenceIds: [] }),
  ];
  const result = report({
    products,
    truthFindings: [
      healthTruthFindingFixture('p1'),
      healthTruthFindingFixture('p2', {
        evidenceSummary: {
          evidenceCount: 0,
          independentSourceCount: 0,
          strongestAuthority: 'UNKNOWN',
          missingProvenanceCount: 0,
        },
      }),
    ],
  });
  assert.equal(result.coverageSummary.productsWithSufficientEvidence, 1);
  assert.equal(result.productsWithoutEvidence, 1);
  assert.equal(result.coverageSummary.evidenceCoveragePercentage, 50);
});
