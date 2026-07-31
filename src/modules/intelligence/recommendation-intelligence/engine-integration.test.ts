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
  truthContextFixture,
  truthEvidenceFixture,
  truthProductFixture,
} from '../testing/product-truth-fixtures.ts';
import { productFixture } from '../testing/fixtures.ts';
import type { Evidence } from '../domain/types.ts';
import { createRecommendationIntelligenceBundle } from './factory.ts';
import { getRecommendationPlan } from './integration.ts';

function setup(input: {
  readonly recommendationCapability?: boolean;
  readonly contributor?: boolean;
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

  capabilities.register(rules.capabilityPack);
  capabilities.register(truth.capabilityPack);
  capabilities.register(detective.capabilityPack);
  if (input.recommendationCapability !== false) {
    capabilities.register(recommendation.capabilityPack);
  }
  for (const detector of [...rules.detectors, ...truth.detectors, ...detective.detectors]) {
    detectors.register(detector);
  }
  for (const strategy of [
    rules.recommendationStrategy,
    truth.recommendationStrategy,
    detective.recommendationStrategy,
  ]) strategies.register(strategy);

  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry: capabilities,
    recommendationEngine: new RecommendationEngine(strategies, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: { hasher, ids, clock },
    reportContributors: input.contributor === false
      ? []
      : [recommendation.reportContributor],
  }, {
    engineVersion: '7.5.0',
    reportSchemaVersion: '1',
  });
  return { engine, rules, truth, detective, recommendation };
}

function suppliedEvidence(
  id: string,
  value: unknown,
  providerType = 'RETAILER',
): Evidence {
  const base = truthEvidenceFixture(id, value);
  return {
    ...base,
    metadata: {
      ...base.metadata,
      providerType,
      sourceIdentity: id,
    },
  };
}

test('all upstream capabilities produce one Recommendation Plan in report metadata', async () => {
  const product = truthProductFixture({
    title: '',
    seo: { title: '', description: '', handle: '', evidenceIds: [] },
  });
  const report = await setup().engine.analyze(truthContextFixture([], {
    products: [product],
    capabilityPackIds: [],
  }));
  const plan = getRecommendationPlan(report);
  assert.ok(plan);
  assert.equal(plan.productsAnalyzed, 1);
  assert.equal(plan.totalRecommendations > 0, true);
  assert.equal(plan.totalRecommendations, plan.summary.recommendationCount);
  assert.equal(report.metadata?.recommendationPlan, plan);
});

test('Rule, Product Truth, and AI Detective outputs remain visible alongside the plan', async () => {
  const report = await setup().engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'First'),
    suppliedEvidence('b', 'Second'),
  ], {
    products: [truthProductFixture({ title: '' })],
    capabilityPackIds: [],
  }));
  const plan = getRecommendationPlan(report);
  assert.ok(plan);
  assert.equal(report.issues.some(({ detectorId }) => detectorId.startsWith('rules.')), true);
  assert.equal(report.issues.some(({ detectorId }) => detectorId === 'product-truth.analysis'), true);
  assert.equal(report.issues.some(({ detectorId }) => detectorId.startsWith('ai-detective.')), true);
  const planCategories = new Set(plan.groupedRecommendations.map(({ category }) => category));
  assert.equal(planCategories.has('PRODUCT_TRUTH'), true);
  assert.equal(planCategories.has('CONTRADICTION'), true);
  assert.equal(plan.blockers.length > 0, true);
});

test('duplicate identity and SEO recommendations are sequenced through existing engine output', async () => {
  const variant = productFixture().variants[0];
  const products = [
    truthProductFixture({
      id: 'p1',
      variants: [{ ...variant, id: 'v1', sku: 'SAME' }],
      seo: { title: '', description: '', handle: '', evidenceIds: [] },
    }),
    truthProductFixture({
      id: 'p2',
      variants: [{ ...variant, id: 'v2', sku: 'same' }],
      seo: { title: '', description: '', handle: '', evidenceIds: [] },
    }),
  ];
  const report = await setup().engine.analyze(truthContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    products,
    capabilityPackIds: [],
  }));
  const plan = getRecommendationPlan(report)!;
  const identity = plan.groupedRecommendations
    .flatMap(({ recommendations }) => recommendations)
    .find(({ relatedContradictionIds }) => relatedContradictionIds.length > 0);
  assert.ok(identity);
  assert.equal(plan.executionOrder.includes(identity.id), true);
  assert.equal(plan.groupedRecommendations.some(({ category }) => category === 'SEO'), true);
});

test('existing engine reports remain unchanged when Recommendation Intelligence is not registered', async () => {
  const report = await setup({
    recommendationCapability: false,
    contributor: false,
  }).engine.analyze(truthContextFixture([], { capabilityPackIds: [] }));
  assert.equal(getRecommendationPlan(report), undefined);
  assert.equal(report.metadata, undefined);
  assert.equal('reportContributors' in report.executionTimings, false);
});

test('registered contributor emits nothing when capability selection excludes Recommendation Intelligence', async () => {
  const report = await setup().engine.analyze(truthContextFixture([], {
    capabilityPackIds: [
      'deterministic-quality',
      'product-truth',
      'ai-detective',
    ],
  }));
  assert.equal(getRecommendationPlan(report), undefined);
  assert.equal(report.metadata, undefined);
});

test('capability registration without a report contributor does not change report behavior', async () => {
  const report = await setup({ contributor: false }).engine.analyze(truthContextFixture([], {
    capabilityPackIds: [],
  }));
  assert.equal(getRecommendationPlan(report), undefined);
  assert.equal(report.metadata, undefined);
});

test('plan and Intelligence Report fingerprints reproduce for fixed upstream output', async () => {
  const context = truthContextFixture([
    suppliedEvidence('a', 'First'),
    suppliedEvidence('b', 'Second'),
  ], { capabilityPackIds: [] });
  const first = await setup().engine.analyze(context);
  const second = await setup().engine.analyze(context);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(getRecommendationPlan(first)?.fingerprint, getRecommendationPlan(second)?.fingerprint);
  assert.deepEqual(
    getRecommendationPlan(first)?.executionOrder,
    getRecommendationPlan(second)?.executionOrder,
  );
});

test('Recommendation Intelligence does not mutate context, issues, or upstream recommendations', async () => {
  const context = truthContextFixture([], { capabilityPackIds: [] });
  const before = JSON.stringify(context);
  const report = await setup().engine.analyze(context);
  assert.equal(JSON.stringify(context), before);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(getRecommendationPlan(report)), true);
  assert.equal(Object.isFrozen(getRecommendationPlan(report)?.groupedRecommendations), true);
});
