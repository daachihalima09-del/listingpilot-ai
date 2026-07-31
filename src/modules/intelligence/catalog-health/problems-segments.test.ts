import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import {
  catalogHealthInputFixture,
  healthDetectiveFindingFixture,
  healthIssueFixture,
  healthProductFixture,
  healthRecommendationFixture,
} from '../testing/catalog-health-fixtures.ts';
import {
  analyzeProblemConcentration,
  createCatalogHealthBundle,
  createCatalogHealthConfiguration,
} from './index.ts';

const hasher = new DeterministicHasher();

function report(
  input: Parameters<typeof catalogHealthInputFixture>[0],
  configuration: Parameters<typeof createCatalogHealthBundle>[0]['configuration'] = {},
) {
  return createCatalogHealthBundle({
    hasher,
    configuration,
  }).reportBuilder.build(catalogHealthInputFixture(input));
}

test('catalog problems group by canonical identity rather than display text', () => {
  const issues = [
    healthIssueFixture('a', 'p1', {
      title: 'First display label',
      metadata: { semanticDetectorId: 'same-family' },
    }),
    healthIssueFixture('b', 'p2', {
      title: 'Second display label',
      metadata: { semanticDetectorId: 'same-family' },
    }),
  ];
  const result = report({
    products: [healthProductFixture('p1'), healthProductFixture('p2')],
    issues,
  });
  assert.equal(result.topProblems.length, 1);
  assert.equal(result.topProblems[0].affectedProducts, 2);
  assert.equal(result.topProblems[0].totalOccurrences, 2);
});

test('equal display labels do not merge different canonical identities', () => {
  const issues = [
    healthIssueFixture('a', 'p1', {
      title: 'Same display label',
      metadata: { semanticDetectorId: 'family-a' },
    }),
    healthIssueFixture('b', 'p1', {
      title: 'Same display label',
      metadata: { semanticDetectorId: 'family-b' },
    }),
  ];
  assert.equal(report({ issues }).topProblems.length, 2);
});

test('repeated occurrences on one product count one affected product', () => {
  const issues = [
    healthIssueFixture('a', 'product-1', { metadata: { semanticDetectorId: 'same' } }),
    healthIssueFixture('b', 'product-1', { metadata: { semanticDetectorId: 'same' } }),
  ];
  const problem = report({ issues }).topProblems[0];
  assert.equal(problem.affectedProducts, 1);
  assert.equal(problem.totalOccurrences, 2);
});

test('blockers and higher severity rank before minor widespread problems', () => {
  const products = Array.from({ length: 4 }, (_, index) => healthProductFixture(`p${index}`));
  const critical = healthIssueFixture('critical', 'p0', {
    severity: 'CRITICAL',
    metadata: { semanticDetectorId: 'critical-family' },
  });
  const low = products.map(({ id }, index) => healthIssueFixture(`low-${index}`, id, {
    severity: 'LOW',
    metadata: { semanticDetectorId: 'low-family' },
  }));
  const blocker = healthRecommendationFixture('blocker', 'p0', {
    relatedIssueIds: ['critical'],
    blockingStatus: 'BLOCKER',
    priority: 1,
    estimatedImpact: 'CRITICAL',
  });
  const result = report({ products, issues: [critical, ...low], recommendations: [blocker] });
  assert.equal(result.topProblems[0].canonicalProblemKey, 'semanticDetectorId:critical-family');
  assert.equal(result.topProblems[0].blockerCount, 1);
});

test('representative product samples are stable and bounded', () => {
  const products = Array.from({ length: 8 }, (_, index) => healthProductFixture(`p${index}`));
  const issues = products.map(({ id }, index) => healthIssueFixture(`issue-${index}`, id, {
    metadata: { semanticDetectorId: 'family' },
  }));
  const result = report({ products: [...products].reverse(), issues }, {
    representativeProductLimit: 3,
  });
  assert.deepEqual(result.topProblems[0].representativeProductIds, ['p0', 'p1', 'p2']);
});

test('vendor and product-type segments summarize health deterministically', () => {
  const products = [
    healthProductFixture('p1', { vendor: 'Brand A', productType: 'TV' }),
    healthProductFixture('p2', { vendor: 'Brand A', productType: 'TV' }),
    healthProductFixture('p3', { vendor: 'Brand B', productType: 'Audio' }),
  ];
  const result = report({
    products,
    issues: [healthIssueFixture('warning', 'p2', { severity: 'HIGH' })],
  }, {
    segmentPolicies: [{
      type: 'VENDOR',
      includeMissing: false,
      excludedKeys: [],
    }, {
      type: 'PRODUCT_TYPE',
      includeMissing: false,
      excludedKeys: [],
    }],
    minimumSegmentSize: 2,
  });
  assert.deepEqual(result.segmentSummaries.map(({ segmentKey }) => segmentKey), [
    'tv',
    'brand a',
  ]);
  assert.equal(result.segmentSummaries.every(({ productCount }) => productCount === 2), true);
});

test('missing segment fields are safe and optionally included', () => {
  const products = [
    healthProductFixture('p1', { vendor: undefined }),
    healthProductFixture('p2', { vendor: undefined }),
  ];
  const excluded = report({ products }, {
    segmentPolicies: [{
      type: 'VENDOR',
      includeMissing: false,
      excludedKeys: [],
    }],
  });
  const included = report({ products }, {
    segmentPolicies: [{
      type: 'VENDOR',
      includeMissing: true,
      excludedKeys: [],
    }],
  });
  assert.equal(excluded.segmentSummaries.length, 0);
  assert.equal(included.segmentSummaries[0].segmentKey, '__missing__');
});

test('maximum segment limit protects high-cardinality metadata', () => {
  const products = Array.from({ length: 20 }, (_, index) => healthProductFixture(`p${index}`, {
    attributes: { channel: `channel-${index}` },
  }));
  const result = report({ products }, {
    segmentPolicies: [{
      type: 'METADATA',
      metadataKey: 'channel',
      includeMissing: false,
      excludedKeys: [],
    }],
    minimumSegmentSize: 1,
    maximumSegments: 5,
  });
  assert.equal(result.segmentSummaries.length, 5);
  assert.deepEqual(
    result.segmentSummaries.map(({ segmentKey }) => segmentKey),
    ['channel-0', 'channel-1', 'channel-10', 'channel-11', 'channel-12'],
  );
});

test('concentration classifies catalog-wide and isolated problems at boundaries', () => {
  const products = Array.from({ length: 10 }, (_, index) => healthProductFixture(`p${index}`));
  const configuration = createCatalogHealthConfiguration({
    concentrationThresholds: {
      catalogWideAffectedPercentage: 50,
      isolatedMaximumProducts: 2,
    },
  });
  assert.equal(analyzeProblemConcentration({
    affectedProductIds: new Set(products.slice(0, 5).map(({ id }) => id)),
    products,
    configuration,
  }).kind, 'CATALOG_WIDE');
  assert.equal(analyzeProblemConcentration({
    affectedProductIds: new Set(products.slice(0, 2).map(({ id }) => id)),
    products,
    configuration,
  }).kind, 'ISOLATED');
});

test('concentration detects brand distribution without causal language', () => {
  const products = Array.from({ length: 10 }, (_, index) => healthProductFixture(`p${index}`, {
    vendor: index < 6 ? 'Brand A' : 'Brand B',
  }));
  const configuration = createCatalogHealthConfiguration({
    segmentPolicies: [{
      type: 'VENDOR',
      includeMissing: false,
      excludedKeys: [],
    }],
    concentrationThresholds: {
      catalogWideAffectedPercentage: 90,
      segmentAffectedSharePercentage: 70,
      isolatedMaximumProducts: 2,
    },
  });
  const concentration = analyzeProblemConcentration({
    affectedProductIds: new Set(['p0', 'p1', 'p2', 'p3']),
    products,
    configuration,
  });
  assert.equal(concentration.kind, 'SEGMENT_CONCENTRATED');
  assert.equal(concentration.segmentLabel, 'Brand A');
  assert.doesNotMatch(concentration.explanation, /cause|caused|because/i);
});

test('focus areas are blocker-first, bounded, and traceable to recommendations', () => {
  const issue = healthIssueFixture('issue-blocker');
  const blocker = healthRecommendationFixture('blocker', 'product-1', {
    category: 'PRODUCT_TRUTH',
    priority: 1,
    blockingStatus: 'BLOCKER',
    relatedIssueIds: [issue.id],
    estimatedImpact: 'CRITICAL',
  });
  const quickWin = healthRecommendationFixture('quick', 'product-1', {
    category: 'SEO',
    priority: 3,
    blockingStatus: 'NON_BLOCKING',
    estimatedImpact: 'HIGH',
    estimatedEffort: 'SMALL',
  });
  const result = report({
    issues: [issue],
    recommendations: [quickWin, blocker],
  }, { focusAreaLimit: 1 });
  assert.equal(result.priorityFocusAreas.length, 1);
  assert.equal(result.priorityFocusAreas[0].blockerStatus, 'BLOCKER');
  assert.deepEqual(result.priorityFocusAreas[0].relatedRecommendationIds, ['blocker']);
  assert.equal(result.priorityFocusAreas[0].requiresMerchantApproval, true);
  assert.equal(result.priorityFocusAreas[0].relatedCatalogProblemIds.length, 1);
});

test('Detective contradictions become problems even without a duplicate issue', () => {
  const finding = healthDetectiveFindingFixture();
  const result = report({ detectiveFindings: [finding] });
  assert.equal(result.topProblems[0].relatedContradictionIds.includes(
    finding.contradiction.id,
  ), true);
});
