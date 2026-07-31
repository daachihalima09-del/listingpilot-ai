import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NeutralConfidenceStrategy } from '../confidence/confidence.ts';
import {
  DeterministicHasher,
  FixedIntelligenceClock,
  SequenceIdGenerator,
} from '../deterministic/services.ts';
import { DetectorRegistry } from '../detectors/registry.ts';
import { IntelligenceEngine } from '../engine/intelligence-engine.ts';
import { CapabilityPackRegistry } from '../packs/capability.ts';
import { KnowledgePackRegistry } from '../packs/knowledge.ts';
import {
  RecommendationEngine,
  RecommendationStrategyRegistry,
} from '../recommendations/engine.ts';
import { createAIDetectiveBundle } from '../ai-detective/factory.ts';
import { createProductTruthBundle } from '../product-truth/factory.ts';
import { createDeterministicRuleBundle } from '../rules/factory.ts';
import {
  catalogHealthInputFixture,
  healthIssueFixture,
  healthProductFixture,
  healthRecommendationFixture,
} from '../testing/catalog-health-fixtures.ts';
import { truthContextFixture } from '../testing/product-truth-fixtures.ts';
import { createRecommendationIntelligenceBundle } from '../recommendation-intelligence/factory.ts';
import { getRecommendationPlan } from '../recommendation-intelligence/integration.ts';
import {
  createCatalogHealthBundle,
  createCatalogHealthCapabilityPack,
  getCatalogHealthReport,
} from './index.ts';

function setup(input: {
  readonly healthCapability?: boolean;
  readonly healthContributor?: boolean;
  readonly recommendationContributor?: boolean;
} = {}) {
  const hasher = new DeterministicHasher();
  const ids = new SequenceIdGenerator();
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const detectors = new DetectorRegistry();
  const capabilities = new CapabilityPackRegistry();
  const strategies = new RecommendationStrategyRegistry();
  const rules = createDeterministicRuleBundle({ hasher });
  const truth = createProductTruthBundle({ hasher });
  const detective = createAIDetectiveBundle({ hasher });
  const recommendation = createRecommendationIntelligenceBundle({ hasher });
  const health = createCatalogHealthBundle({ hasher });
  capabilities.register(rules.capabilityPack);
  capabilities.register(truth.capabilityPack);
  capabilities.register(detective.capabilityPack);
  capabilities.register(recommendation.capabilityPack);
  if (input.healthCapability !== false) capabilities.register(health.capabilityPack);
  for (const detector of [...rules.detectors, ...truth.detectors, ...detective.detectors]) {
    detectors.register(detector);
  }
  for (const strategy of [
    rules.recommendationStrategy,
    truth.recommendationStrategy,
    detective.recommendationStrategy,
  ]) strategies.register(strategy);
  const contributors = [
    ...(input.recommendationContributor === false ? [] : [recommendation.reportContributor]),
    ...(input.healthContributor === false ? [] : [health.reportContributor]),
  ];
  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry: capabilities,
    recommendationEngine: new RecommendationEngine(strategies, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: { hasher, ids, clock },
    reportContributors: contributors,
  }, {
    engineVersion: '7.6.0',
    reportSchemaVersion: '1',
  });
  return { engine, rules, truth, detective, recommendation, health };
}

test('Catalog Health capability declares and validates every upstream dependency', () => {
  const pack = createCatalogHealthCapabilityPack();
  assert.deepEqual(pack.dependencies, [
    'deterministic-quality',
    'product-truth',
    'ai-detective',
    'recommendation-intelligence',
  ]);
  assert.throws(
    () => new CapabilityPackRegistry().register(pack),
    /dependencies must be registered first/i,
  );
  assert.doesNotThrow(() => setup());
});

test('all Sprint 7 capabilities produce Catalog Health after Recommendation Intelligence', async () => {
  const report = await setup().engine.analyze(truthContextFixture([], {
    capabilityPackIds: [],
  }));
  const recommendationPlan = getRecommendationPlan(report);
  const health = getCatalogHealthReport(report);
  assert.ok(recommendationPlan);
  assert.ok(health);
  assert.equal(report.metadata?.recommendationPlan, recommendationPlan);
  assert.equal(report.metadata?.catalogHealth, health);
  assert.equal(health.recommendationSummary.totalRecommendations, recommendationPlan.totalRecommendations);
  assert.equal(Object.isFrozen(health), true);
});

test('Catalog Health contributor safely reports insufficient analysis when plan output is missing', async () => {
  const report = await setup({
    recommendationContributor: false,
  }).engine.analyze(truthContextFixture([], { capabilityPackIds: [] }));
  const health = getCatalogHealthReport(report);
  assert.ok(health);
  assert.equal(getRecommendationPlan(report), undefined);
  assert.equal(health.overallHealthStatus, 'INSUFFICIENT_ANALYSIS');
  assert.equal(health.coverageSummary.missingCapabilities.includes(
    'recommendation-intelligence',
  ), true);
});

test('disabled Catalog Health contributor preserves Recommendation Intelligence output', async () => {
  const report = await setup({ healthContributor: false }).engine.analyze(
    truthContextFixture([], { capabilityPackIds: [] }),
  );
  assert.ok(getRecommendationPlan(report));
  assert.equal(getCatalogHealthReport(report), undefined);
  assert.equal('catalogHealth' in (report.metadata ?? {}), false);
});

test('absence of Catalog Health capability and contributor preserves prior report fingerprint', async () => {
  const context = truthContextFixture([], {
    capabilityPackIds: [
      'deterministic-quality',
      'product-truth',
      'ai-detective',
      'recommendation-intelligence',
    ],
  });
  const withoutCapability = await setup({
    healthCapability: false,
    healthContributor: false,
  }).engine.analyze(context);
  const registeredButNotSelected = await setup({
    healthContributor: false,
  }).engine.analyze(context);
  assert.equal(withoutCapability.fingerprint, registeredButNotSelected.fingerprint);
  assert.deepEqual(withoutCapability.metadata, registeredButNotSelected.metadata);
});

test('typed accessor rejects unrelated metadata', () => {
  assert.equal(getCatalogHealthReport({
    metadata: { catalogHealth: { capabilityId: 'other' } },
  } as never), undefined);
});

test('reordered products, issues, and recommendations preserve fingerprints', () => {
  const hasher = new DeterministicHasher();
  const builder = createCatalogHealthBundle({ hasher }).reportBuilder;
  const products = [healthProductFixture('p1'), healthProductFixture('p2')];
  const issues = [
    healthIssueFixture('a', 'p1', { metadata: { semanticDetectorId: 'family-a' } }),
    healthIssueFixture('b', 'p2', { metadata: { semanticDetectorId: 'family-b' } }),
  ];
  const recommendations = [
    healthRecommendationFixture('r1', 'p1', { relatedIssueIds: ['a'] }),
    healthRecommendationFixture('r2', 'p2', { relatedIssueIds: ['b'] }),
  ];
  const firstInput = catalogHealthInputFixture({ products, issues, recommendations });
  const secondInput = catalogHealthInputFixture({
    products: [...products].reverse(),
    issues: [...issues].reverse(),
    recommendations,
  });
  const secondPlan = {
    ...secondInput.recommendationPlan!,
    groupedRecommendations: secondInput.recommendationPlan!.groupedRecommendations.map((group) => ({
      ...group,
      recommendations: [...group.recommendations].reverse(),
    })),
    executionOrder: firstInput.recommendationPlan!.executionOrder,
    fingerprint: firstInput.recommendationPlan!.fingerprint,
  };
  const first = builder.build(firstInput);
  const second = builder.build({ ...secondInput, recommendationPlan: secondPlan });
  assert.equal(first.catalogFingerprint, second.catalogFingerprint);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.topProblems, second.topProblems);
});

test('repeated report building produces stable IDs and fingerprints', () => {
  const builder = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder;
  const input = catalogHealthInputFixture({
    issues: [healthIssueFixture()],
    recommendations: [healthRecommendationFixture()],
  });
  const first = builder.build(input);
  const second = builder.build(input);
  assert.equal(first.reportId, second.reportId);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first, second);
});

test('malformed recommendation dependencies fail explicitly', () => {
  const builder = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder;
  const input = catalogHealthInputFixture({
    recommendations: [healthRecommendationFixture('bad', 'product-1', {
      dependencies: ['missing'],
    })],
  });
  assert.throws(() => builder.build(input), /missing dependency/i);
});

test('unsupported upstream statuses fail explicitly', () => {
  const builder = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder;
  const input = catalogHealthInputFixture({
    recommendations: [healthRecommendationFixture('bad-status', 'product-1', {
      blockingStatus: 'UNSUPPORTED' as never,
    })],
  });
  assert.throws(() => builder.build(input), /unsupported status or level/i);
});

test('duplicate stable product and issue IDs fail explicitly', () => {
  const builder = createCatalogHealthBundle({
    hasher: new DeterministicHasher(),
  }).reportBuilder;
  const product = healthProductFixture();
  assert.throws(() => builder.build(catalogHealthInputFixture({
    products: [product, product],
  })), /unique non-empty stable IDs/i);
  const issue = healthIssueFixture();
  assert.throws(() => builder.build(catalogHealthInputFixture({
    issues: [issue, issue],
  })), /unique non-empty stable IDs/i);
});
