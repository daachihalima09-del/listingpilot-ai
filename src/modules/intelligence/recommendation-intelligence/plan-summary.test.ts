import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { contextFixture } from '../testing/fixtures.ts';
import {
  createRecommendationPlanFixture,
  recommendationIssueFixture,
  sourceRecommendationFixture,
  truthExecutionFixture,
} from '../testing/recommendation-intelligence-fixtures.ts';
import { createRecommendationIntelligenceBundle } from './factory.ts';
import { evaluateRecommendationPlanQuality } from './quality-status.ts';

test('empty issue output produces an immutable ready plan', () => {
  const plan = createRecommendationPlanFixture({ issues: [], recommendations: [] });
  assert.equal(plan.totalRecommendations, 0);
  assert.equal(plan.highestPriority, null);
  assert.deepEqual(plan.executionOrder, []);
  assert.equal(plan.summary.publishingReadiness, 'READY');
  assert.equal(Object.isFrozen(plan), true);
});

test('an issue becomes one actionable recommendation with upstream traceability', () => {
  const issue = recommendationIssueFixture();
  const source = sourceRecommendationFixture(issue.id);
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [source],
  });
  const recommendation = plan.groupedRecommendations[0].recommendations[0];
  assert.equal(recommendation.title, source.title);
  assert.equal(recommendation.explanation, source.explanation);
  assert.deepEqual(recommendation.relatedIssueIds, [issue.id]);
  assert.deepEqual(recommendation.metadata.sourceRecommendationIds, [source.id]);
  assert.equal(recommendation.metadata.recommendationRuleId, 'recommendation.data-completeness');
});

test('Product Truth claim groups resolve to exact Truth Finding IDs', () => {
  const issue = recommendationIssueFixture({
    id: 'truth-issue',
    detectorId: 'product-truth.analysis',
    code: 'truth.claim.conflicted',
    category: 'PRODUCT_TRUTH',
    severity: 'HIGH',
    metadata: {
      claimGroupId: 'claim-group-77',
      importance: 'HIGH',
    },
  });
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [sourceRecommendationFixture(issue.id)],
    detectorExecutions: [truthExecutionFixture('claim-group-77', 'finding-77')],
  });
  const recommendation = plan.groupedRecommendations[0].recommendations[0];
  assert.deepEqual(recommendation.relatedTruthFindingIds, ['finding-77']);
  assert.equal(recommendation.category, 'PRODUCT_TRUTH');
});

test('AI Detective contradictions remain traceable in planned recommendations', () => {
  const issue = recommendationIssueFixture({
    id: 'detective-issue',
    detectorId: 'ai-detective.truth-conflict',
    code: 'detective.value_conflict',
    category: 'PRODUCT_TRUTH',
    severity: 'HIGH',
    metadata: {
      contradictionId: 'contradiction-9',
      contradictionType: 'VALUE_CONFLICT',
      truthFindingIds: ['truth-9'],
    },
  });
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [sourceRecommendationFixture(issue.id)],
  });
  const recommendation = plan.groupedRecommendations[0].recommendations[0];
  assert.equal(recommendation.category, 'CONTRADICTION');
  assert.deepEqual(recommendation.relatedContradictionIds, ['contradiction-9']);
  assert.deepEqual(recommendation.relatedTruthFindingIds, ['truth-9']);
});

test('critical recommendations become blockers with highest publishing urgency', () => {
  const issue = recommendationIssueFixture({
    id: 'critical-price',
    detectorId: 'rules.variant',
    code: 'VARIANT_PRICE_MISSING',
    category: 'PRICING',
    severity: 'CRITICAL',
    affectedFields: ['variants.v1.price'],
    metadata: { ruleId: 'variant.price.missing' },
  });
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [sourceRecommendationFixture(issue.id, {
      estimatedImpact: 'HIGH',
    })],
  });
  assert.equal(plan.blockers.length, 1);
  assert.equal(plan.blockers[0].blockingStatus, 'BLOCKER');
  assert.equal(plan.blockers[0].priority, 1);
  assert.equal(plan.blockers[0].estimatedImpact, 'CRITICAL');
  assert.equal(plan.summary.publishingReadiness, 'BLOCKED');
});

test('high-impact small-effort identity work becomes a quick win', () => {
  const issue = recommendationIssueFixture({
    id: 'missing-sku',
    detectorId: 'rules.variant',
    code: 'VARIANT_SKU_MISSING',
    category: 'VARIANT',
    severity: 'HIGH',
    affectedFields: ['variants.v1.sku'],
    metadata: { ruleId: 'variant.sku.missing' },
  });
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [sourceRecommendationFixture(issue.id, {
      estimatedImpact: 'HIGH',
      estimatedEffort: 'LOW',
    })],
  });
  assert.equal(plan.quickWins.length, 1);
  assert.equal(plan.quickWins[0].category, 'IDENTITY');
  assert.equal(plan.quickWins[0].estimatedImpact, 'HIGH');
  assert.equal(plan.quickWins[0].estimatedEffort, 'SMALL');
});

test('truth blockers are sequenced before dependent SEO recommendations', () => {
  const truth = recommendationIssueFixture({
    id: 'truth',
    detectorId: 'product-truth.analysis',
    code: 'truth.claim.conflicted',
    category: 'PRODUCT_TRUTH',
    severity: 'HIGH',
    metadata: { claimGroupId: 'group-truth' },
  });
  const seo = recommendationIssueFixture({
    id: 'seo',
    detectorId: 'rules.seo',
    code: 'SEO_DESCRIPTION_MISSING',
    category: 'SEO',
    severity: 'MEDIUM',
    affectedFields: ['seo.description'],
    metadata: { ruleId: 'seo.description.missing' },
  });
  const plan = createRecommendationPlanFixture({
    issues: [seo, truth],
    recommendations: [
      sourceRecommendationFixture(seo.id),
      sourceRecommendationFixture(truth.id),
    ],
  });
  const truthRecommendation = plan.groupedRecommendations
    .flatMap(({ recommendations }) => recommendations)
    .find(({ relatedIssueIds }) => relatedIssueIds.includes('truth'))!;
  const seoRecommendation = plan.groupedRecommendations
    .flatMap(({ recommendations }) => recommendations)
    .find(({ relatedIssueIds }) => relatedIssueIds.includes('seo'))!;
  assert.deepEqual(seoRecommendation.dependencies, [truthRecommendation.id]);
  assert.equal(plan.executionOrder.indexOf(truthRecommendation.id)
    < plan.executionOrder.indexOf(seoRecommendation.id), true);
  assert.equal(truthRecommendation.blockingStatus, 'BLOCKER');
  assert.equal(seoRecommendation.blockingStatus, 'BLOCKED');
});

test('medium-or-larger non-blocking work is identified as long-term improvement', () => {
  const issue = recommendationIssueFixture({
    id: 'catalog-work',
    detectorId: 'rules.catalog',
    code: 'CATALOG_HANDLE_DUPLICATE',
    category: 'CATALOG_HEALTH',
    severity: 'MEDIUM',
    affectedFields: ['seo.handle', 'title'],
    metadata: { ruleId: 'catalog.handle.duplicate' },
  });
  const plan = createRecommendationPlanFixture({
    issues: [issue],
    recommendations: [sourceRecommendationFixture(issue.id, {
      estimatedImpact: 'MEDIUM',
      estimatedEffort: 'MEDIUM',
    })],
  });
  assert.equal(plan.longTermImprovements.length, 1);
  assert.equal(plan.longTermImprovements[0].category, 'CATALOG');
});

test('structured summary reports blockers, quick wins, effort, and readiness without generated prose', () => {
  const blocker = recommendationIssueFixture({
    id: 'blocker',
    detectorId: 'rules.variant',
    code: 'VARIANT_PRICE_MISSING',
    category: 'PRICING',
    severity: 'CRITICAL',
    metadata: { ruleId: 'variant.price.missing' },
  });
  const plan = createRecommendationPlanFixture({
    issues: [blocker],
    recommendations: [sourceRecommendationFixture(blocker.id)],
  });
  assert.deepEqual(Object.keys(plan.summary).sort(), [
    'blockerCount',
    'estimatedMerchantEffort',
    'groupCount',
    'publishingReadiness',
    'quickWinCount',
    'recommendationCount',
  ]);
  assert.equal(plan.summary.blockerCount, 1);
  assert.equal(plan.summary.recommendationCount, 1);
  assert.equal(plan.summary.publishingReadiness, 'BLOCKED');
});

test('plan IDs, ordering, statistics, and fingerprints reproduce', () => {
  const issues = [
    recommendationIssueFixture({ id: 'b', fingerprint: 'b' }),
    recommendationIssueFixture({ id: 'a', fingerprint: 'a' }),
  ];
  const recommendations = issues.map((issue) => sourceRecommendationFixture(issue.id));
  const first = createRecommendationPlanFixture({ issues, recommendations });
  const second = createRecommendationPlanFixture({
    issues: [...issues].reverse(),
    recommendations: [...recommendations].reverse(),
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.executionOrder, second.executionOrder);
  assert.deepEqual(
    first.groupedRecommendations.flatMap(({ recommendations: items }) => items.map(({ id }) => id)),
    second.groupedRecommendations.flatMap(({ recommendations: items }) => items.map(({ id }) => id)),
  );
});

test('category and minimum-impact configuration filter only the requested plan output', () => {
  const hasher = new DeterministicHasher();
  const bundle = createRecommendationIntelligenceBundle({
    hasher,
    configuration: {
      enabledRecommendationCategories: ['SEO'],
      minimumIncludedImpact: 'HIGH',
    },
  });
  const lowSeo = recommendationIssueFixture({
    id: 'low-seo',
    detectorId: 'rules.seo',
    category: 'SEO',
    severity: 'LOW',
    metadata: { ruleId: 'seo.title.too_short' },
  });
  const highSeo = recommendationIssueFixture({
    id: 'high-seo',
    detectorId: 'rules.seo',
    category: 'SEO',
    severity: 'HIGH',
    metadata: { ruleId: 'seo.title.missing' },
  });
  const data = recommendationIssueFixture({ id: 'data' });
  const plan = bundle.planner.createPlan({
    context: contextFixture(),
    issues: [lowSeo, highSeo, data],
    recommendations: [
      sourceRecommendationFixture(lowSeo.id),
      sourceRecommendationFixture(highSeo.id),
      sourceRecommendationFixture(data.id),
    ],
    detectorExecutions: [],
  });
  assert.equal(plan.totalRecommendations, 1);
  assert.deepEqual(plan.groupedRecommendations.map(({ category }) => category), ['SEO']);
});

test('quality helper mirrors structured publishing readiness', () => {
  const ready = evaluateRecommendationPlanQuality(
    createRecommendationPlanFixture({ issues: [], recommendations: [] }),
  );
  const blockerIssue = recommendationIssueFixture({
    id: 'blocker',
    severity: 'CRITICAL',
    metadata: { ruleId: 'variant.price.missing' },
    category: 'PRICING',
  });
  const blocked = evaluateRecommendationPlanQuality(createRecommendationPlanFixture({
    issues: [blockerIssue],
    recommendations: [sourceRecommendationFixture(blockerIssue.id)],
  }));
  assert.equal(ready.status, 'READY');
  assert.equal(blocked.status, 'BLOCKED');
  assert.equal(blocked.blockerCount, 1);
  assert.equal(Object.isFrozen(blocked), true);
});
