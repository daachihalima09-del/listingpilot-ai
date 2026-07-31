import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import {
  catalogHealthInputFixture,
  healthIssueFixture,
} from '../testing/catalog-health-fixtures.ts';
import {
  createCatalogHealthBundle,
  createCatalogHealthConfiguration,
  DEFAULT_HEALTH_DIMENSIONS,
  gradeForHealthScore,
  HEALTH_DIMENSIONS,
} from './index.ts';

test('default dimension weights are explicit and total 100', () => {
  const configuration = createCatalogHealthConfiguration();
  assert.equal(configuration.enabledDimensions.reduce(
    (sum, id) => sum + configuration.dimensionWeights[id],
    0,
  ), 100);
  assert.deepEqual(
    [...configuration.enabledDimensions].sort(),
    [...DEFAULT_HEALTH_DIMENSIONS].sort(),
  );
});

test('every generic health dimension is supported while readiness is not double-counted by default', () => {
  assert.deepEqual(HEALTH_DIMENSIONS, [
    'IDENTITY',
    'DATA_COMPLETENESS',
    'PRODUCT_TRUTH',
    'CONSISTENCY',
    'SEO',
    'MEDIA',
    'VARIANTS',
    'PRICING',
    'SPECIFICATIONS',
    'CATALOG_INTEGRITY',
    'PUBLISHING_READINESS',
  ]);
  assert.equal(createCatalogHealthConfiguration().enabledDimensions.includes(
    'PUBLISHING_READINESS',
  ), false);
});

test('configuration rejects negative weights and duplicate dimensions', () => {
  assert.throws(() => createCatalogHealthConfiguration({
    dimensionWeights: { PRODUCT_TRUTH: -1 },
  }), /cannot be negative/i);
  assert.throws(() => createCatalogHealthConfiguration({
    enabledDimensions: ['SEO', 'SEO'],
    normalizeEnabledWeights: true,
  }), /duplicated/i);
});

test('configuration rejects implicit weight redistribution', () => {
  assert.throws(() => createCatalogHealthConfiguration({
    enabledDimensions: DEFAULT_HEALTH_DIMENSIONS.filter((id) => id !== 'PRICING'),
  }), /total 100/i);
  assert.doesNotThrow(() => createCatalogHealthConfiguration({
    enabledDimensions: DEFAULT_HEALTH_DIMENSIONS.filter((id) => id !== 'PRICING'),
    normalizeEnabledWeights: true,
  }));
});

test('configuration rejects overlapping thresholds and invalid percentages', () => {
  assert.throws(() => createCatalogHealthConfiguration({
    healthGradeThresholds: { A: 80, B: 80 },
  }), /descending non-overlapping/i);
  assert.throws(() => createCatalogHealthConfiguration({
    minimumCoveragePercentage: 101,
  }), /between 0 and 100/i);
  assert.throws(() => createCatalogHealthConfiguration({
    blockerPenalties: { perProduct: 101 },
  }), /between 0 and 100/i);
  assert.throws(() => createCatalogHealthConfiguration({
    readinessMappings: {
      criticalIssue: 'READY',
      highIssue: 'BLOCKED',
    },
  }), /more restrictive/i);
});

test('configuration rejects unsupported and malformed segment policies', () => {
  assert.throws(() => createCatalogHealthConfiguration({
    segmentPolicies: [{
      type: 'METADATA',
      includeMissing: false,
      excludedKeys: [],
    }],
  }), /segment policies are invalid/i);
  assert.throws(() => createCatalogHealthConfiguration({
    segmentPolicies: [{
      type: 'VENDOR',
      includeMissing: false,
      excludedKeys: [],
    }, {
      type: 'VENDOR',
      includeMissing: true,
      excludedKeys: [],
    }],
  }), /segment policies are invalid/i);
});

test('grade mapping is deterministic at every configured boundary', () => {
  const configuration = createCatalogHealthConfiguration();
  assert.equal(gradeForHealthScore(100, configuration), 'A');
  assert.equal(gradeForHealthScore(90, configuration), 'A');
  assert.equal(gradeForHealthScore(89.99, configuration), 'B');
  assert.equal(gradeForHealthScore(80, configuration), 'B');
  assert.equal(gradeForHealthScore(70, configuration), 'C');
  assert.equal(gradeForHealthScore(60, configuration), 'D');
  assert.equal(gradeForHealthScore(0, configuration), 'F');
});

test('every default dimension is emitted with a bounded score', () => {
  const bundle = createCatalogHealthBundle({ hasher: new DeterministicHasher() });
  const report = bundle.reportBuilder.build(catalogHealthInputFixture({
    issues: [
      healthIssueFixture('identity', 'product-1', {
        affectedFields: ['title'],
      }),
      healthIssueFixture('truth', 'product-1', {
        category: 'PRODUCT_TRUTH',
        metadata: { claimGroupId: 'truth-group-product-1' },
      }),
      healthIssueFixture('consistency', 'product-1', {
        category: 'PRODUCT_TRUTH',
        metadata: { contradictionId: 'contradiction-product-1' },
      }),
      healthIssueFixture('seo', 'product-1', { category: 'SEO' }),
      healthIssueFixture('media', 'product-1', { category: 'MEDIA' }),
      healthIssueFixture('variant', 'product-1', { category: 'VARIANT' }),
      healthIssueFixture('pricing', 'product-1', { category: 'PRICING' }),
      healthIssueFixture('specification', 'product-1', { category: 'SPECIFICATION' }),
      healthIssueFixture('completeness', 'product-1', {
        category: 'DATA_QUALITY',
        affectedFields: ['description'],
      }),
    ],
  }));
  assert.deepEqual(
    report.healthDimensions.map(({ dimensionId }) => dimensionId).sort(),
    [...DEFAULT_HEALTH_DIMENSIONS].sort(),
  );
  assert.equal(report.healthDimensions.every(({ score }) => score >= 0 && score <= 100), true);
});

test('catalog score remains bounded under many critical penalties', () => {
  const issues = Array.from({ length: 20 }, (_, index) => healthIssueFixture(
    `critical-${index}`,
    'product-1',
    {
      severity: 'CRITICAL',
      metadata: { semanticDetectorId: `critical-family-${index}` },
    },
  ));
  const report = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder.build(catalogHealthInputFixture({ issues }));
  assert.equal(report.overallHealthScore >= 0, true);
  assert.equal(report.overallHealthScore <= 100, true);
});

test('disabled dimensions are excluded only through explicit normalized configuration', () => {
  const bundle = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
    configuration: {
      enabledDimensions: DEFAULT_HEALTH_DIMENSIONS.filter((id) => id !== 'PRICING'),
      normalizeEnabledWeights: true,
    },
  });
  const report = bundle.reportBuilder.build(catalogHealthInputFixture({
    issues: [healthIssueFixture('price', 'product-1', { category: 'PRICING' })],
  }));
  assert.equal(report.healthDimensions.some(({ dimensionId }) => dimensionId === 'PRICING'), false);
  assert.equal(report.scoreExplanation.weightedDimensionScore, 100);
});
