import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { IntelligenceDomainError } from '../domain/errors.ts';
import {
  plannedRecommendationFixture,
} from '../testing/recommendation-intelligence-fixtures.ts';
import { createRecommendationIntelligenceConfiguration } from './configuration.ts';
import {
  buildRecommendationDependencyGraph,
  topologicalRecommendationOrder,
  type RecommendationDependencyNode,
} from './dependency-graph.ts';
import { groupRecommendations } from './grouping.ts';

function node(
  id: string,
  category: RecommendationDependencyNode['category'],
  input: Partial<RecommendationDependencyNode> = {},
): RecommendationDependencyNode {
  return {
    id,
    category,
    affectedProductIds: ['product-1'],
    prerequisiteCategories: [],
    blocker: false,
    prioritySeed: 50,
    ...input,
  };
}

test('dependency graph links recommendations to same-product prerequisite anchors', () => {
  const graph = buildRecommendationDependencyGraph([
    node('truth', 'PRODUCT_TRUTH', { blocker: true, prioritySeed: 100 }),
    node('seo', 'SEO', { prerequisiteCategories: ['PRODUCT_TRUTH'] }),
  ]);
  assert.deepEqual(graph.dependenciesByRecommendationId.get('seo'), ['truth']);
  assert.equal(graph.dependentCounts.get('truth'), 1);
});

test('dependency graph does not link unrelated products', () => {
  const graph = buildRecommendationDependencyGraph([
    node('truth-a', 'PRODUCT_TRUTH', { affectedProductIds: ['product-a'] }),
    node('seo-b', 'SEO', {
      affectedProductIds: ['product-b'],
      prerequisiteCategories: ['PRODUCT_TRUTH'],
    }),
  ]);
  assert.deepEqual(graph.dependenciesByRecommendationId.get('seo-b'), []);
});

test('catalog-scoped prerequisites can block product recommendations', () => {
  const graph = buildRecommendationDependencyGraph([
    node('catalog-truth', 'PRODUCT_TRUTH', {
      affectedProductIds: ['product-a', 'product-b'],
      blocker: true,
    }),
    node('seo-a', 'SEO', {
      affectedProductIds: ['product-a'],
      prerequisiteCategories: ['PRODUCT_TRUTH'],
    }),
  ]);
  assert.deepEqual(graph.dependenciesByRecommendationId.get('seo-a'), ['catalog-truth']);
});

test('anchor selection prefers blockers, then priority seed, then stable ID', () => {
  const graph = buildRecommendationDependencyGraph([
    node('ordinary', 'IDENTITY', { prioritySeed: 200 }),
    node('blocker-z', 'IDENTITY', { blocker: true, prioritySeed: 10 }),
    node('blocker-a', 'IDENTITY', { blocker: true, prioritySeed: 10 }),
    node('variants', 'VARIANTS', { prerequisiteCategories: ['IDENTITY'] }),
  ]);
  assert.deepEqual(graph.dependenciesByRecommendationId.get('variants'), ['blocker-a']);
});

test('topological order always places prerequisites before dependents', () => {
  const order = topologicalRecommendationOrder({
    recommendationIds: ['c', 'b', 'a'],
    dependenciesByRecommendationId: new Map([
      ['a', []],
      ['b', ['a']],
      ['c', ['b']],
    ]),
    compare: (left, right) => left.localeCompare(right),
  });
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('topological ordering uses deterministic comparison for independent nodes', () => {
  const order = topologicalRecommendationOrder({
    recommendationIds: ['z', 'a', 'm'],
    dependenciesByRecommendationId: new Map(),
    compare: (left, right) => left.localeCompare(right),
  });
  assert.deepEqual(order, ['a', 'm', 'z']);
});

test('dependency cycles fail clearly instead of producing an unsafe plan', () => {
  assert.throws(() => topologicalRecommendationOrder({
    recommendationIds: ['a', 'b'],
    dependenciesByRecommendationId: new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]),
    compare: (left, right) => left.localeCompare(right),
  }), IntelligenceDomainError);
});

test('grouping uses configured category order and deterministic recommendation order', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  const recommendations = [
    plannedRecommendationFixture({ id: 'seo', category: 'SEO', fingerprint: 'seo' }),
    plannedRecommendationFixture({ id: 'truth', category: 'PRODUCT_TRUTH', fingerprint: 'truth' }),
    plannedRecommendationFixture({ id: 'seo-2', category: 'SEO', fingerprint: 'seo-2' }),
  ];
  const groups = groupRecommendations({
    recommendations,
    executionOrder: ['truth', 'seo-2', 'seo'],
    configuration,
    hasher: new DeterministicHasher(),
  });
  assert.deepEqual(groups.map(({ category }) => category), ['PRODUCT_TRUTH', 'SEO']);
  assert.deepEqual(groups[1].recommendations.map(({ id }) => id), ['seo-2', 'seo']);
});

test('group completion dependencies include only prerequisites outside the group', () => {
  const groups = groupRecommendations({
    recommendations: [
      plannedRecommendationFixture({
        id: 'truth',
        category: 'PRODUCT_TRUTH',
        fingerprint: 'truth',
      }),
      plannedRecommendationFixture({
        id: 'seo',
        category: 'SEO',
        dependencies: ['truth'],
        fingerprint: 'seo',
      }),
    ],
    executionOrder: ['truth', 'seo'],
    configuration: createRecommendationIntelligenceConfiguration(),
    hasher: new DeterministicHasher(),
  });
  assert.deepEqual(groups.find(({ category }) => category === 'SEO')?.completionDependencies, ['truth']);
});

test('group impact, effort, and fingerprints aggregate deterministically', () => {
  const input = {
    recommendations: [
      plannedRecommendationFixture({
        id: 'one',
        estimatedImpact: 'HIGH' as const,
        estimatedEffort: 'SMALL' as const,
        fingerprint: 'one',
      }),
      plannedRecommendationFixture({
        id: 'two',
        estimatedImpact: 'MEDIUM' as const,
        estimatedEffort: 'MEDIUM' as const,
        fingerprint: 'two',
      }),
    ],
    executionOrder: ['one', 'two'],
    configuration: createRecommendationIntelligenceConfiguration(),
    hasher: new DeterministicHasher(),
  };
  const first = groupRecommendations(input)[0];
  const second = groupRecommendations({
    ...input,
    recommendations: [...input.recommendations].reverse(),
  })[0];
  assert.equal(first.estimatedImpact, 'HIGH');
  assert.equal(first.estimatedEffort, 'MEDIUM');
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(Object.isFrozen(first), true);
});
