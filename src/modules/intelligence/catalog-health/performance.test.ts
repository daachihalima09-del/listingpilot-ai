import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import type { NormalizedProduct } from '../domain/types.ts';
import {
  catalogHealthInputFixture,
  healthDetectiveFindingFixture,
  healthIssueFixture,
  healthProductFixture,
  healthRecommendationFixture,
  healthTruthFindingFixture,
} from '../testing/catalog-health-fixtures.ts';
import { createCatalogHealthBundle } from './index.ts';

function largeProduct(index: number): NormalizedProduct {
  return healthProductFixture(`product-${index}`, {
    description: undefined,
    specifications: [],
    variants: [],
    media: [],
    seo: { evidenceIds: [] },
    categories: [],
    tags: [],
  });
}

test('map-based Catalog Health aggregation handles the required large generated dataset', () => {
  const productCount = 10_000;
  const issueCount = 30_000;
  const truthFindingCount = 10_000;
  const contradictionCount = 5_000;
  const recommendationCount = 20_000;
  const products = Array.from({ length: productCount }, (_, index) => largeProduct(index));
  const issues = Array.from({ length: issueCount }, (_, index) => healthIssueFixture(
    `issue-${index}`,
    `product-${index % productCount}`,
    {
      severity: index % 10 === 0 ? 'HIGH' : 'LOW',
      category: index % 3 === 0 ? 'SEO' : 'DATA_QUALITY',
      affectedFields: index % 3 === 0 ? ['seo.description'] : ['description'],
      metadata: {
        semanticDetectorId: `large-family-${index % 30}`,
        deterministic: true,
      },
    },
  ));
  const truthFindings = Array.from(
    { length: truthFindingCount },
    (_, index) => healthTruthFindingFixture(`product-${index}`),
  );
  const detectiveFindings = Array.from(
    { length: contradictionCount },
    (_, index) => healthDetectiveFindingFixture(`product-${index}`, {
      reviewRequirement: index % 20 === 0 ? 'BLOCKING' : 'OPTIONAL',
    }),
  );
  const recommendations = Array.from(
    { length: recommendationCount },
    (_, index) => healthRecommendationFixture(
      `recommendation-${index}`,
      `product-${index % productCount}`,
      {
        category: index % 2 === 0 ? 'SEO' : 'DATA_COMPLETENESS',
        relatedIssueIds: [`issue-${index % issueCount}`],
        priority: index % 20 === 0 ? 1 : 4,
        blockingStatus: index % 20 === 0 ? 'BLOCKER' : 'NON_BLOCKING',
        estimatedImpact: index % 20 === 0 ? 'CRITICAL' : 'MEDIUM',
      },
    ),
  );
  const report = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
    configuration: {
      representativeProductLimit: 3,
      topProblemLimit: 10,
    },
  }).reportBuilder.build(catalogHealthInputFixture({
    products,
    issues,
    truthFindings,
    detectiveFindings,
    recommendations,
  }));
  assert.equal(report.productsAnalyzed, productCount);
  assert.equal(report.coverageSummary.productsWithProductTruthFindings, truthFindingCount);
  assert.equal(report.recommendationSummary.totalRecommendations, recommendationCount);
  assert.equal(report.topProblems.length <= 10, true);
  assert.equal(report.topProblems.every(
    ({ representativeProductIds }) => representativeProductIds.length <= 3,
  ), true);
  assert.equal(report.productHealthSummaries.length, productCount);
  assert.equal(report.fingerprint.length > 0, true);
});
