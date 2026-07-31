import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { contextFixture, productFixture } from '../testing/fixtures.ts';
import {
  recommendationIssueFixture,
  sourceRecommendationFixture,
} from '../testing/recommendation-intelligence-fixtures.ts';
import { createRecommendationIntelligenceBundle } from './factory.ts';

test('map-based planning handles thousands of independent issues deterministically', () => {
  const size = 4_000;
  const issues = Array.from({ length: size }, (_, index) => recommendationIssueFixture({
    id: `issue-${index}`,
    fingerprint: `issue-fingerprint-${index}`,
    affectedProductIds: [`product-${index}`],
  }));
  const recommendations = issues.map((issue) => sourceRecommendationFixture(issue.id));
  const bundle = createRecommendationIntelligenceBundle({
    hasher: new DeterministicHasher(),
  });
  const input = {
    context: contextFixture({
      analysisScope: 'FULL_CATALOG' as const,
      products: Array.from({ length: size }, (_, index) => productFixture({
        id: `product-${index}`,
      })),
    }),
    issues,
    recommendations,
    detectorExecutions: [],
  };
  const first = bundle.planner.createPlan(input);
  const second = bundle.planner.createPlan(input);
  assert.equal(first.totalRecommendations, size);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.executionOrder, second.executionOrder);
});

test('dependency planning remains linear for thousands of product-local truth and SEO issues', () => {
  const productCount = 1_500;
  const issues = Array.from({ length: productCount }, (_, index) => {
    const productId = `product-${index}`;
    return [
      recommendationIssueFixture({
        id: `truth-${index}`,
        fingerprint: `truth-fingerprint-${index}`,
        detectorId: 'product-truth.analysis',
        code: 'truth.claim.conflicted',
        category: 'PRODUCT_TRUTH',
        severity: 'HIGH',
        affectedProductIds: [productId],
        metadata: { claimGroupId: `group-${index}` },
      }),
      recommendationIssueFixture({
        id: `seo-${index}`,
        fingerprint: `seo-fingerprint-${index}`,
        detectorId: 'rules.seo',
        code: 'SEO_DESCRIPTION_MISSING',
        category: 'SEO',
        severity: 'MEDIUM',
        affectedProductIds: [productId],
        affectedFields: ['seo.description'],
        metadata: { ruleId: 'seo.description.missing' },
      }),
    ];
  }).flat();
  const plan = createRecommendationIntelligenceBundle({
    hasher: new DeterministicHasher(),
  }).planner.createPlan({
    context: contextFixture({
      analysisScope: 'FULL_CATALOG',
      products: Array.from({ length: productCount }, (_, index) => productFixture({
        id: `product-${index}`,
      })),
    }),
    issues,
    recommendations: issues.map((issue) => sourceRecommendationFixture(issue.id)),
    detectorExecutions: [],
  });
  const all = plan.groupedRecommendations.flatMap(({ recommendations }) => recommendations);
  const order = new Map(plan.executionOrder.map((id, index) => [id, index]));
  assert.equal(plan.totalRecommendations, productCount * 2);
  assert.equal(plan.blockers.length, productCount);
  for (const seo of all.filter(({ category }) => category === 'SEO')) {
    assert.equal(seo.dependencies.length, 1);
    assert.equal((order.get(seo.dependencies[0]) ?? Infinity) < (order.get(seo.id) ?? -1), true);
  }
});
