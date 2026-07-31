import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NeutralConfidenceStrategy } from '../confidence/confidence.ts';
import {
  DeterministicHasher,
  FixedIntelligenceClock,
  SequenceIdGenerator,
} from '../deterministic/services.ts';
import { DetectorRegistry } from '../detectors/registry.ts';
import type { IntelligenceDetector } from '../detectors/contract.ts';
import { IntelligenceEngine } from '../engine/intelligence-engine.ts';
import { CapabilityPackRegistry } from '../packs/capability.ts';
import { KnowledgePackRegistry } from '../packs/knowledge.ts';
import {
  RecommendationEngine,
  RecommendationStrategyRegistry,
} from '../recommendations/engine.ts';
import { createProductTruthBundle } from '../product-truth/factory.ts';
import { getProductTruthReport } from '../product-truth/report.ts';
import { createDeterministicRuleBundle } from '../rules/factory.ts';
import {
  truthContextFixture,
  truthEvidenceFixture,
  truthProductFixture,
} from '../testing/product-truth-fixtures.ts';
import { productFixture } from '../testing/fixtures.ts';
import { contradictionFixture } from '../testing/ai-detective-fixtures.ts';
import type { Evidence } from '../domain/types.ts';
import { createAIDetectiveBundle } from './factory.ts';
import { getAIDetectiveReport } from './report.ts';

type Mode = 'truth' | 'truth-detective' | 'rules-truth-detective';

function setup(mode: Mode, additionalDetectors: readonly IntelligenceDetector[] = []) {
  const hasher = new DeterministicHasher();
  const ids = new SequenceIdGenerator();
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const detectorRegistry = new DetectorRegistry();
  const capabilityPackRegistry = new CapabilityPackRegistry();
  const recommendationRegistry = new RecommendationStrategyRegistry();
  const truth = createProductTruthBundle({ hasher });
  const detective = createAIDetectiveBundle({ hasher });
  const rules = createDeterministicRuleBundle({ hasher });

  capabilityPackRegistry.register(truth.capabilityPack);
  for (const detector of truth.detectors) detectorRegistry.register(detector);
  recommendationRegistry.register(truth.recommendationStrategy);

  if (mode !== 'truth') {
    capabilityPackRegistry.register(detective.capabilityPack);
    for (const detector of detective.detectors) detectorRegistry.register(detector);
    recommendationRegistry.register(detective.recommendationStrategy);
  }
  if (mode === 'rules-truth-detective') {
    capabilityPackRegistry.register(rules.capabilityPack);
    for (const detector of rules.detectors) detectorRegistry.register(detector);
    recommendationRegistry.register(rules.recommendationStrategy);
  }
  for (const detector of additionalDetectors) detectorRegistry.register(detector);

  const engine = new IntelligenceEngine({
    detectorRegistry,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry,
    recommendationEngine: new RecommendationEngine(recommendationRegistry, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: { hasher, ids, clock },
  }, {
    engineVersion: '7.4.0',
    reportSchemaVersion: '1',
  });
  return { engine, truth, detective, rules };
}

function suppliedEvidence(
  id: string,
  value: unknown,
  input: {
    readonly productId?: string;
    readonly providerType?: string;
    readonly sourceIdentity?: string;
  } = {},
): Evidence {
  const base = truthEvidenceFixture(id, value);
  return {
    ...base,
    metadata: {
      ...base.metadata,
      productId: input.productId ?? 'product-1',
      providerType: input.providerType ?? 'MANUFACTURER',
      sourceIdentity: input.sourceIdentity ?? id,
    },
  };
}

test('Product Truth can run alone without AI Detective', async () => {
  const report = await setup('truth').engine.analyze(truthContextFixture([]));
  assert.ok(getProductTruthReport(report));
  assert.equal(getAIDetectiveReport(report), undefined);
  assert.equal(report.detectorStatistics.some(({ detectorId }) => detectorId.startsWith('ai-detective.')), false);
});

test('AI Detective runs after Product Truth and detects conflicting values', async () => {
  const report = await setup('truth-detective').engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'First', { providerType: 'RETAILER' }),
    suppliedEvidence('b', 'Second', { providerType: 'RETAILER' }),
  ], { capabilityPackIds: [] }));
  const truthExecution = report.detectorStatistics.findIndex(
    ({ detectorId }) => detectorId === 'product-truth.analysis',
  );
  const detectiveExecution = report.detectorStatistics.findIndex(
    ({ detectorId }) => detectorId === 'ai-detective.truth-conflict',
  );
  assert.equal(truthExecution >= 0, true);
  assert.equal(detectiveExecution > truthExecution, true);
  assert.equal(report.issues.some(({ code }) => code === 'detective.value_conflict'), true);
  assert.equal((getAIDetectiveReport(report)?.contradictionsByType.VALUE_CONFLICT ?? 0) > 0, true);
});

test('duplicate identities become issues and merchant-approved recommendations end-to-end', async () => {
  const base = productFixture();
  const products = [
    truthProductFixture({
      id: 'p1',
      variants: [{ ...base.variants[0], id: 'v1', sku: 'SHARED' }],
    }),
    truthProductFixture({
      id: 'p2',
      variants: [{ ...base.variants[0], id: 'v2', sku: 'shared' }],
    }),
  ];
  const report = await setup('truth-detective').engine.analyze(truthContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    products,
    capabilityPackIds: [],
  }));
  const issue = report.issues.find(({ code }) => code === 'detective.duplicate_identity');
  assert.ok(issue);
  const recommendation = report.recommendations.find(({ issueIds }) => issueIds.includes(issue.id));
  assert.ok(recommendation);
  assert.equal(recommendation.approvalRequirement, 'MERCHANT');
  assert.deepEqual(recommendation.proposedValues, []);
});

test('deterministic rules, Product Truth, and AI Detective coexist without identity collisions', async () => {
  const base = productFixture();
  const products = [
    truthProductFixture({
      id: 'p1',
      title: '',
      variants: [{ ...base.variants[0], id: 'v1', sku: 'DUPLICATE' }],
    }),
    truthProductFixture({
      id: 'p2',
      variants: [{ ...base.variants[0], id: 'v2', sku: 'DUPLICATE' }],
    }),
  ];
  const report = await setup('rules-truth-detective').engine.analyze(truthContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    products,
    capabilityPackIds: [],
  }));
  assert.equal(report.detectorStatistics.some(({ detectorId }) => detectorId.startsWith('rules.')), true);
  assert.ok(getProductTruthReport(report));
  assert.ok(getAIDetectiveReport(report));
  assert.equal(report.issues.some(({ code }) => code === 'detective.duplicate_identity'), true);
  assert.equal(new Set(report.detectorStatistics.map(({ detectorId }) => detectorId)).size, report.detectorStatistics.length);
  assert.equal(new Set(report.issues.map(({ id }) => id)).size, report.issues.length);
});

test('capability selection skips AI Detective when its Product Truth dependency is absent from context', async () => {
  const report = await setup('truth-detective').engine.analyze(truthContextFixture([], {
    capabilityPackIds: ['ai-detective'],
  }));
  assert.equal(getProductTruthReport(report), undefined);
  assert.equal(getAIDetectiveReport(report), undefined);
  assert.equal(report.skippedDetectors.includes('product-truth.analysis'), true);
  assert.equal(report.skippedDetectors.includes('ai-detective.report'), true);
});

test('Detective report, issue, and recommendation fingerprints reproduce', async () => {
  const base = productFixture();
  const context = truthContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    products: [
      truthProductFixture({
        id: 'p1',
        variants: [{ ...base.variants[0], id: 'v1', sku: 'same' }],
      }),
      truthProductFixture({
        id: 'p2',
        variants: [{ ...base.variants[0], id: 'v2', sku: 'same' }],
      }),
    ],
    capabilityPackIds: [],
  });
  const first = await setup('truth-detective').engine.analyze(context);
  const second = await setup('truth-detective').engine.analyze(context);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(getAIDetectiveReport(first)?.fingerprint, getAIDetectiveReport(second)?.fingerprint);
  assert.deepEqual(
    first.issues.filter(({ code }) => code.startsWith('detective.')).map(({ fingerprint }) => fingerprint),
    second.issues.filter(({ code }) => code.startsWith('detective.')).map(({ fingerprint }) => fingerprint),
  );
  assert.deepEqual(
    first.recommendations.filter(({ strategyId }) => strategyId.startsWith('ai-detective.')).map(({ fingerprint }) => fingerprint),
    second.recommendations.filter(({ strategyId }) => strategyId.startsWith('ai-detective.')).map(({ fingerprint }) => fingerprint),
  );
});

test('the engine preserves caller input while passing Product Truth metadata internally', async () => {
  const context = truthContextFixture([], { capabilityPackIds: [] });
  const before = JSON.stringify(context);
  const report = await setup('truth-detective').engine.analyze(context);
  assert.equal(JSON.stringify(context), before);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(getAIDetectiveReport(report)), true);
});

test('future contradiction producers can add fragments without replacing deterministic detectors', async () => {
  const future: IntelligenceDetector = {
    metadata: {
      id: 'future-ai.contradiction',
      displayName: 'Future AI contradiction',
      version: '1.0.0',
      description: 'Test-only future contradiction producer.',
      issueCategories: ['PRODUCT_TRUTH'],
      supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
      requiredCapabilities: ['product-truth', 'ai-detective'],
      priority: 1_700,
      parallelSafe: false,
      enabled: true,
      deterministic: false,
    },
    execute: () => ({
      issues: [],
      warnings: [],
      metrics: { contradictionCount: 1 },
      metadata: {
        aiDetectiveContradictions: [contradictionFixture({
          id: 'future-contradiction',
          fingerprint: 'future-fingerprint',
          type: 'SUSPICIOUS_COMBINATION',
          severity: 'MEDIUM',
        })],
      },
    }),
  };
  const report = await setup('truth-detective', [future]).engine.analyze(truthContextFixture([], {
    capabilityPackIds: [],
  }));
  const detective = getAIDetectiveReport(report);
  assert.equal(detective?.findings.some(({ contradiction }) => contradiction.id === 'future-contradiction'), true);
  assert.equal(report.detectorStatistics.some(({ detectorId }) => detectorId === 'ai-detective.identity-conflict'), true);
});
