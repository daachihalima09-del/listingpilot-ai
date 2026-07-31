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
import { createDeterministicRuleBundle } from '../rules/factory.ts';
import {
  truthContextFixture,
  truthEvidenceFixture,
  truthProductFixture,
} from '../testing/product-truth-fixtures.ts';
import { createProductTruthBundle } from './factory.ts';
import { ProductTruthClaimExtractorRegistry } from './extractors.ts';
import { getProductTruthReport } from './report.ts';
import type { Evidence, IntelligenceContext } from '../domain/types.ts';

function suppliedEvidence(
  id: string,
  value: unknown,
  input: {
    productId?: string;
    providerType?: string;
    sourceIdentity?: string;
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

function setup(mode: 'truth' | 'rules' | 'both' = 'truth') {
  const hasher = new DeterministicHasher();
  const ids = new SequenceIdGenerator();
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const detectors = new DetectorRegistry();
  const capabilities = new CapabilityPackRegistry();
  const recommendations = new RecommendationStrategyRegistry();
  const truth = createProductTruthBundle({ hasher });
  const rules = createDeterministicRuleBundle({ hasher });
  if (mode === 'truth' || mode === 'both') {
    capabilities.register(truth.capabilityPack);
    for (const detector of truth.detectors) detectors.register(detector);
    recommendations.register(truth.recommendationStrategy);
  }
  if (mode === 'rules' || mode === 'both') {
    capabilities.register(rules.capabilityPack);
    for (const detector of rules.detectors) detectors.register(detector);
    recommendations.register(rules.recommendationStrategy);
  }
  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry: capabilities,
    recommendationEngine: new RecommendationEngine(recommendations, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: { hasher, ids, clock },
  }, {
    engineVersion: '7.3.0',
    reportSchemaVersion: '1',
  });
  return { engine, truth, rules };
}

test('empty full catalog runs Product Truth through the existing Intelligence Engine', async () => {
  const report = await setup().engine.analyze(truthContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    products: [],
    capabilityPackIds: [],
  }));
  const truth = getProductTruthReport(report);
  assert.ok(truth);
  assert.equal(truth.productCount, 0);
  assert.equal(truth.claimCount, 0);
  assert.equal(truth.findings.length, 0);
  assert.equal(report.issues.length, 0);
});

test('one product with no evidence produces Product Truth findings and attention issues', async () => {
  const report = await setup().engine.analyze(truthContextFixture([]));
  const truth = getProductTruthReport(report);
  assert.ok(truth);
  assert.equal(truth.insufficientEvidenceCount > 0, true);
  assert.equal(report.issues.some(({ code }) => code === 'truth.evidence.insufficient'), true);
  assert.equal(report.recommendations.length > 0, true);
});

test('agreeing evidence is exposed as a verified Product Truth finding in detector metadata', async () => {
  const report = await setup().engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'Generic product'),
    suppliedEvidence('b', 'Generic product'),
  ]));
  const truth = getProductTruthReport(report);
  const title = truth?.findings.find(({ fieldPath }) => fieldPath === 'title');
  assert.equal(title?.status, 'VERIFIED');
  assert.equal(report.detectorStatistics[0].metadata?.capabilityId, 'product-truth');
});

test('conflicting evidence creates an IntelligenceIssue and deterministic recommendation', async () => {
  const report = await setup().engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'Generic product', { providerType: 'RETAILER' }),
    suppliedEvidence('b', 'Different product', { providerType: 'RETAILER' }),
  ]));
  const issue = report.issues.find(({ code }) => code === 'truth.claim.conflicted');
  assert.ok(issue);
  const recommendation = report.recommendations.find(({ issueIds }) => issueIds.includes(issue.id));
  assert.ok(recommendation);
  assert.equal(recommendation.approvalRequirement, 'MERCHANT');
  assert.deepEqual(recommendation.proposedValues, []);
});

test('selected-product analysis resolves only products supplied in the selected context', async () => {
  const first = truthProductFixture({ id: 'p1', title: 'First' });
  const second = truthProductFixture({ id: 'p2', title: 'Second' });
  const evidence = [
    suppliedEvidence('p1-a', 'First', { productId: 'p1' }),
    suppliedEvidence('p1-b', 'First', { productId: 'p1' }),
  ];
  const report = await setup().engine.analyze(truthContextFixture(evidence, {
    analysisScope: 'SELECTED_PRODUCTS',
    products: [first],
  }));
  const truth = getProductTruthReport(report);
  assert.deepEqual([...new Set(truth?.findings.map(({ productId }) => productId))], ['p1']);
  assert.equal(truth?.findings.some(({ productId }) => productId === second.id), false);
});

test('full-catalog Product Truth keeps product claim groups isolated', async () => {
  const products = [
    truthProductFixture({ id: 'p1', title: 'First' }),
    truthProductFixture({ id: 'p2', title: 'Second' }),
  ];
  const evidence = [
    suppliedEvidence('p1', 'First', { productId: 'p1' }),
    suppliedEvidence('p2', 'Second', { productId: 'p2' }),
  ];
  const report = await setup().engine.analyze(truthContextFixture(evidence, {
    analysisScope: 'FULL_CATALOG',
    products,
  }));
  const truth = getProductTruthReport(report);
  assert.deepEqual([...new Set(truth?.findings.map(({ productId }) => productId))].sort(), ['p1', 'p2']);
});

test('deterministic-quality can run without Product Truth', async () => {
  const report = await setup('rules').engine.analyze(truthContextFixture([], {
    capabilityPackIds: [],
  }));
  assert.equal(getProductTruthReport(report), undefined);
  assert.equal(report.detectorStatistics.some(({ detectorId }) => detectorId.startsWith('rules.')), true);
  assert.equal(report.issues.some(({ code }) => code.startsWith('truth.')), false);
});

test('Product Truth can run without deterministic-quality', async () => {
  const report = await setup('truth').engine.analyze(truthContextFixture([]));
  assert.ok(getProductTruthReport(report));
  assert.equal(report.detectorStatistics.some(({ detectorId }) => detectorId.startsWith('rules.')), false);
  assert.equal(report.issues.some(({ metadata }) => typeof metadata.ruleId === 'string'), false);
});

test('both capabilities coexist without detector or issue identity collisions', async () => {
  const report = await setup('both').engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'Generic product', { providerType: 'RETAILER' }),
    suppliedEvidence('b', 'Different product', { providerType: 'RETAILER' }),
  ], {
    products: [truthProductFixture({ title: '' })],
    capabilityPackIds: [],
  }));
  assert.equal(report.issues.some(({ metadata }) => metadata.ruleId === 'product.title.missing'), true);
  assert.equal(report.issues.some(({ code }) => code === 'truth.claim.conflicted'), true);
  assert.equal(new Set(report.detectorStatistics.map(({ detectorId }) => detectorId)).size, 9);
  assert.equal(new Set(report.issues.map(({ id }) => id)).size, report.issues.length);
});

test('Product Truth report, issue, recommendation, and Intelligence Report fingerprints reproduce', async () => {
  const context = truthContextFixture([
    suppliedEvidence('a', 'Generic product', { providerType: 'RETAILER' }),
    suppliedEvidence('b', 'Different product', { providerType: 'RETAILER' }),
  ]);
  const first = await setup().engine.analyze(context);
  const second = await setup().engine.analyze(context);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(getProductTruthReport(first)?.deterministicFingerprint, getProductTruthReport(second)?.deterministicFingerprint);
  assert.deepEqual(first.issues.map(({ fingerprint }) => fingerprint), second.issues.map(({ fingerprint }) => fingerprint));
  assert.deepEqual(first.recommendations.map(({ fingerprint }) => fingerprint), second.recommendations.map(({ fingerprint }) => fingerprint));
});

test('fixed clock, ID generator, hash provider, and immutable input are honored', async () => {
  const context: IntelligenceContext = truthContextFixture([
    suppliedEvidence('a', 'Generic product'),
  ]);
  const before = JSON.stringify(context);
  const report = await setup().engine.analyze(context);
  assert.equal(JSON.stringify(context), before);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(report.startedAt, '2026-07-29T10:00:00.000Z');
  assert.match(report.id, /^report_\d+$/u);
  assert.equal(Object.isFrozen(getProductTruthReport(report)), true);
});

test('Product Truth report contributes detector metrics and PRODUCT_TRUTH statistics', async () => {
  const report = await setup().engine.analyze(truthContextFixture([
    suppliedEvidence('a', 'Generic product', { providerType: 'RETAILER' }),
    suppliedEvidence('b', 'Different', { providerType: 'RETAILER' }),
  ]));
  const execution = report.detectorStatistics.find(({ detectorId }) => detectorId === 'product-truth.analysis');
  assert.equal((execution?.metrics.claimCount ?? 0) > 0, true);
  assert.equal((execution?.metrics.claimGroupCount ?? 0) > 0, true);
  assert.equal(report.categoryStatistics.PRODUCT_TRUTH > 0, true);
});

test('expected malformed structured evidence becomes a detector warning without failing the report', async () => {
  const empty = truthEvidenceFixture('empty', undefined, {
    rawValue: undefined,
    normalizedValue: undefined,
  });
  const report = await setup().engine.analyze(truthContextFixture([empty]));
  assert.deepEqual(report.failedDetectors, []);
  assert.equal(report.warnings.some((warning) => warning.includes('empty')), true);
  assert.ok(getProductTruthReport(report));
});

test('unexpected Product Truth detector failure is isolated by the existing runner', async () => {
  const hasher = new DeterministicHasher();
  const extractorRegistry = new ProductTruthClaimExtractorRegistry();
  extractorRegistry.register({
    metadata: {
      id: 'test.failing-extractor',
      version: '1.0.0',
      supportedClaimNamespaces: ['*'],
      supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
      deterministic: true,
      priority: 1,
      enabled: true,
    },
    extract: () => {
      throw new Error('expected test failure');
    },
  });
  const bundle = createProductTruthBundle({ hasher, extractorRegistry });
  const detectors = new DetectorRegistry();
  detectors.register(bundle.detectors[0]);
  const capabilities = new CapabilityPackRegistry();
  capabilities.register(bundle.capabilityPack);
  const recommendationStrategies = new RecommendationStrategyRegistry();
  recommendationStrategies.register(bundle.recommendationStrategy);
  const ids = new SequenceIdGenerator();
  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry: capabilities,
    recommendationEngine: new RecommendationEngine(recommendationStrategies, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: {
      hasher,
      ids,
      clock: new FixedIntelligenceClock('2026-07-29T10:00:00.000Z'),
    },
  }, {
    engineVersion: '7.3.0',
    reportSchemaVersion: '1',
  });
  const report = await engine.analyze(truthContextFixture([]));
  assert.deepEqual(report.failedDetectors, ['product-truth.analysis']);
  assert.equal(report.summary.failedDetectorCount, 1);
  assert.equal(report.productCount, 1);
});
