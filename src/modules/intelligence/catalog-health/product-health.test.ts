import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import {
  healthDetectiveFindingFixture,
  healthIssueFixture,
  healthProductFixture,
  healthRecommendationFixture,
  healthTruthFindingFixture,
} from '../testing/catalog-health-fixtures.ts';
import {
  createCatalogHealthConfiguration,
  evaluateProductHealth,
} from './index.ts';

const configuration = createCatalogHealthConfiguration();
const hasher = new DeterministicHasher();

function evaluate(overrides: Partial<Parameters<typeof evaluateProductHealth>[0]> = {}) {
  return evaluateProductHealth({
    product: healthProductFixture(),
    issues: [],
    truthFindings: [healthTruthFindingFixture()],
    detectiveFindings: [],
    recommendations: [],
    quickWinIds: new Set(),
    hasProductTruth: true,
    hasDetective: true,
    hasRecommendationPlan: true,
    configuration,
    hasher,
    ...overrides,
  });
}

test('healthy product is trusted, ready, and scores 100', () => {
  const result = evaluate();
  assert.equal(result.summary.healthScore, 100);
  assert.equal(result.summary.healthGrade, 'A');
  assert.equal(result.summary.truthQualityStatus, 'TRUSTED');
  assert.equal(result.summary.publishingReadiness, 'READY');
  assert.equal(result.sufficientAnalysis, true);
});

test('product with a low-severity warning remains ready with warnings', () => {
  const result = evaluate({
    issues: [healthIssueFixture('warning', 'product-1', {
      severity: 'LOW',
      affectedFields: ['description'],
    })],
  });
  assert.equal(result.summary.publishingReadiness, 'READY_WITH_WARNINGS');
  assert.equal(result.summary.healthScore < 100, true);
  assert.deepEqual(result.summary.affectedDimensions, ['DATA_COMPLETENESS']);
});

test('blocking Detective finding takes precedence and applies a blocker penalty', () => {
  const finding = healthDetectiveFindingFixture('product-1', {
    reviewRequirement: 'BLOCKING',
  });
  const result = evaluate({ detectiveFindings: [finding] });
  assert.equal(result.summary.publishingReadiness, 'BLOCKED');
  assert.equal(result.summary.blockerCount, 1);
  assert.equal(result.summary.healthScore <= 80, true);
});

test('blocking recommendation takes precedence over otherwise healthy inputs', () => {
  const recommendation = healthRecommendationFixture('blocker', 'product-1', {
    blockingStatus: 'BLOCKER',
    priority: 1,
  });
  const result = evaluate({ recommendations: [recommendation] });
  assert.equal(result.summary.publishingReadiness, 'BLOCKED');
  assert.deepEqual(result.summary.priorityRecommendationIds, ['blocker']);
});

test('missing upstream analysis is explicit and never treated as healthy', () => {
  const result = evaluate({
    hasProductTruth: false,
    hasDetective: false,
    hasRecommendationPlan: false,
    truthFindings: [],
  });
  assert.equal(result.sufficientAnalysis, false);
  assert.equal(result.summary.publishingReadiness, 'UNKNOWN');
  assert.equal(result.summary.healthStatus, 'INSUFFICIENT_ANALYSIS');
  assert.equal(result.summary.assessmentConfidence, 40);
});

test('product without evidence has unknown readiness', () => {
  const result = evaluate({
    product: healthProductFixture('product-1', { evidenceIds: [] }),
    truthFindings: [],
  });
  assert.equal(result.summary.truthQualityStatus, 'NO_EVIDENCE');
  assert.equal(result.summary.publishingReadiness, 'UNKNOWN');
});

test('canonical root-cause family prevents duplicate full penalties', () => {
  const root = { semanticDetectorId: 'root:missing-title', deterministic: true };
  const one = evaluate({
    issues: [healthIssueFixture('one', 'product-1', {
      severity: 'HIGH',
      affectedFields: ['title'],
      metadata: root,
    })],
  });
  const duplicated = evaluate({
    issues: [
      healthIssueFixture('one', 'product-1', {
        severity: 'HIGH',
        affectedFields: ['title'],
        metadata: root,
      }),
      healthIssueFixture('two', 'product-1', {
        severity: 'MEDIUM',
        category: 'SEO',
        metadata: root,
      }),
    ],
  });
  assert.equal(duplicated.summary.healthScore, one.summary.healthScore);
  assert.equal(duplicated.canonicalIssueFamilies.length, 1);
});

test('higher severity replaces rather than adds within one root-cause family', () => {
  const root = { ruleId: 'shared-root' };
  const result = evaluate({
    issues: [
      healthIssueFixture('low', 'product-1', {
        severity: 'LOW',
        affectedFields: ['description'],
        metadata: root,
      }),
      healthIssueFixture('high', 'product-1', {
        severity: 'HIGH',
        affectedFields: ['description'],
        metadata: root,
      }),
    ],
  });
  assert.equal(result.canonicalIssueFamilies.length, 1);
  assert.equal(result.dimensionScores.DATA_COMPLETENESS, 80);
});

test('product output and nested collections are immutable', () => {
  const result = evaluate();
  assert.equal(Object.isFrozen(result.summary), true);
  assert.equal(Object.isFrozen(result.summary.issueCountsBySeverity), true);
  assert.equal(Object.isFrozen(result.dimensionScores), true);
});

test('reordered issues produce the same product fingerprint', () => {
  const issues = [
    healthIssueFixture('a', 'product-1', { affectedFields: ['description'] }),
    healthIssueFixture('b', 'product-1', { category: 'SEO' }),
  ];
  const first = evaluate({ issues });
  const second = evaluate({ issues: [...issues].reverse() });
  assert.equal(first.summary.fingerprint, second.summary.fingerprint);
});
