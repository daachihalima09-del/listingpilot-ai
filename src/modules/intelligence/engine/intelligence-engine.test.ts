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
import { CapabilityPackRegistry } from '../packs/capability.ts';
import { KnowledgePackRegistry } from '../packs/knowledge.ts';
import {
  RecommendationEngine,
  RecommendationStrategyRegistry,
  type RecommendationStrategy,
} from '../recommendations/engine.ts';
import {
  capabilityPackFixture,
  contextFixture,
  detectorFixture,
  issueFixture,
  knowledgePackFixture,
  productFixture,
  recommendationFixture,
} from '../testing/fixtures.ts';
import { IntelligenceEngine } from './intelligence-engine.ts';
import type { IntelligenceReportContributor } from './report-contributor.ts';

function setup(input: {
  readonly detectors?: readonly IntelligenceDetector[];
  readonly strategies?: readonly RecommendationStrategy[];
  readonly withPacks?: boolean;
  readonly contributors?: readonly IntelligenceReportContributor[];
} = {}) {
  const detectors = new DetectorRegistry();
  for (const detector of input.detectors ?? []) detectors.register(detector);
  const knowledge = new KnowledgePackRegistry();
  const capabilities = new CapabilityPackRegistry();
  if (input.withPacks) {
    knowledge.register(knowledgePackFixture());
    capabilities.register(capabilityPackFixture());
  }
  const strategies = new RecommendationStrategyRegistry();
  for (const strategy of input.strategies ?? []) strategies.register(strategy);
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const ids = new SequenceIdGenerator();
  const hasher = new DeterministicHasher();
  const recommendations = new RecommendationEngine(strategies, ids, hasher);
  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: knowledge,
    capabilityPackRegistry: capabilities,
    recommendationEngine: recommendations,
    confidenceStrategy: new NeutralConfidenceStrategy('neutral-test'),
    runtime: { clock, ids, hasher },
    reportContributors: input.contributors,
  }, {
    engineVersion: '7.1.0',
    reportSchemaVersion: '1',
  });
  return { engine, clock };
}

test('optional report contributors add deterministic metadata after recommendations', async () => {
  const contributor: IntelligenceReportContributor = {
    id: 'test.summary',
    version: '1.0.0',
    priority: 1,
    metadataKey: 'testSummary',
    enabled: true,
    contribute: ({ issues, recommendations }) => ({
      issueCount: issues.length,
      recommendationCount: recommendations.length,
    }),
  };
  const detector = detectorFixture({ result: { issues: [issueFixture()] } });
  const strategy: RecommendationStrategy = {
    id: 'strategy',
    version: '1.0.0',
    priority: 1,
    enabled: true,
    recommend: () => [recommendationFixture()],
  };
  const report = await setup({
    detectors: [detector],
    strategies: [strategy],
    contributors: [contributor],
  }).engine.analyze(contextFixture());
  assert.deepEqual(report.metadata?.testSummary, {
    issueCount: 1,
    recommendationCount: 1,
  });
  assert.equal('reportContributors' in report.executionTimings, true);
});

test('disabled report contributors preserve the original report shape', async () => {
  const contributor: IntelligenceReportContributor = {
    id: 'test.disabled',
    version: '1.0.0',
    priority: 1,
    metadataKey: 'disabled',
    enabled: false,
    contribute: () => ({ unexpected: true }),
  };
  const report = await setup({ contributors: [contributor] }).engine.analyze(contextFixture());
  const baseline = await setup().engine.analyze(contextFixture());
  assert.equal(report.metadata, undefined);
  assert.equal('reportContributors' in report.executionTimings, false);
  assert.equal(report.fingerprint, baseline.fingerprint);
});

test('duplicate report metadata keys fail closed', async () => {
  const contributor = (id: string): IntelligenceReportContributor => ({
    id,
    version: '1.0.0',
    priority: 1,
    metadataKey: 'duplicate',
    enabled: true,
    contribute: () => ({ id }),
  });
  await assert.rejects(
    setup({ contributors: [contributor('a'), contributor('b')] }).engine.analyze(contextFixture()),
  );
});

test('engine produces an immutable report for an empty full catalog', async () => {
  const { engine } = setup();
  const report = await engine.analyze(contextFixture({ products: [] }));
  assert.equal(report.productCount, 0);
  assert.equal(report.summary.issueCount, 0);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.issues), true);
});

test('the same engine interface supports single-product analysis', async () => {
  const { engine } = setup();
  const report = await engine.analyze(contextFixture({
    analysisScope: 'SINGLE_PRODUCT',
    products: [productFixture()],
  }));
  assert.equal(report.analysisScope, 'SINGLE_PRODUCT');
  assert.equal(report.productCount, 1);
});

test('the same engine interface supports selected-products analysis', async () => {
  const { engine } = setup();
  const report = await engine.analyze(contextFixture({
    analysisScope: 'SELECTED_PRODUCTS',
    products: [productFixture(), productFixture({ id: 'product-2' })],
  }));
  assert.equal(report.analysisScope, 'SELECTED_PRODUCTS');
  assert.equal(report.productCount, 2);
});

test('the same engine interface supports entire-catalog analysis', async () => {
  const { engine } = setup();
  const report = await engine.analyze(contextFixture());
  assert.equal(report.analysisScope, 'FULL_CATALOG');
  assert.equal(report.productCount, 1);
});

test('no eligible detectors produces a valid report with skipped metadata', async () => {
  const detector = detectorFixture({
    metadata: { requiredCapabilities: ['missing-capability'] },
  });
  const { engine } = setup({ detectors: [detector] });
  const report = await engine.analyze(contextFixture());
  assert.equal(report.summary.issueCount, 0);
  assert.deepEqual(report.skippedDetectors, ['detector-1']);
});

test('detector failures are isolated and reflected in report statistics', async () => {
  const detector = detectorFixture({ execute: () => {
    throw new Error('failure');
  } });
  const { engine } = setup({ detectors: [detector] });
  const report = await engine.analyze(contextFixture());
  assert.deepEqual(report.failedDetectors, ['detector-1']);
  assert.equal(report.summary.failedDetectorCount, 1);
  assert.equal(report.warnings.some((warning) => warning.includes('UNEXPECTED_DETECTOR_FAILURE')), true);
});

test('detector timeouts are reflected without preventing a report', async () => {
  const detector = detectorFixture({
    metadata: { timeoutMs: 5 },
    execute: async () => new Promise((resolve) => setTimeout(() => resolve({
      issues: [],
      warnings: [],
      metrics: {},
      metadata: {},
    }), 25)),
  });
  const { engine } = setup({ detectors: [detector] });
  const report = await engine.analyze(contextFixture());
  assert.equal(report.detectorStatistics[0].status, 'TIMED_OUT');
  assert.deepEqual(report.failedDetectors, ['detector-1']);
});

test('cancellation yields a valid report with cancelled detectors skipped', async () => {
  const { engine } = setup({ detectors: [detectorFixture()] });
  const report = await engine.analyze(contextFixture({
    cancellation: { isCancellationRequested: true, reason: 'test' },
  }));
  assert.equal(report.detectorStatistics.length, 0);
  assert.deepEqual(report.skippedDetectors, ['detector-1']);
});

test('engine suppresses duplicate issues before recommendation generation', async () => {
  const detector = detectorFixture({
    result: { issues: [issueFixture(), issueFixture({ id: 'issue-2' })] },
  });
  const { engine } = setup({ detectors: [detector] });
  const report = await engine.analyze(contextFixture());
  assert.equal(report.issues.length, 1);
  assert.equal(report.warnings.includes('Suppressed 1 duplicate issue(s).'), true);
});

test('engine generates recommendations through registered strategies', async () => {
  const detector = detectorFixture({ result: { issues: [issueFixture()] } });
  const strategy: RecommendationStrategy = {
    id: 'strategy',
    version: '1.0.0',
    priority: 1,
    enabled: true,
    recommend: () => [recommendationFixture()],
  };
  const { engine } = setup({ detectors: [detector], strategies: [strategy] });
  const report = await engine.analyze(contextFixture());
  assert.equal(report.recommendations.length, 1);
  assert.equal(report.recommendations[0].confidence?.strategyVersion, 'neutral-test');
});

test('report aggregates severity, category, confidence, and detector statistics', async () => {
  const detector = detectorFixture({
    result: {
      issues: [issueFixture({ severity: 'HIGH', category: 'SEO' })],
      metrics: { inspectedProducts: 1 },
    },
  });
  const { engine } = setup({ detectors: [detector] });
  const report = await engine.analyze(contextFixture());
  assert.equal(report.severityStatistics.HIGH, 1);
  assert.equal(report.categoryStatistics.SEO, 1);
  assert.equal(report.confidenceSummary.MEDIUM, 1);
  assert.equal(report.detectorStatistics[0].metrics.inspectedProducts, 1);
});

test('report fingerprint is reproducible with fixed runtime services', async () => {
  const detector = detectorFixture({ result: { issues: [issueFixture()] } });
  const first = await setup({ detectors: [detector] }).engine.analyze(contextFixture());
  const second = await setup({ detectors: [detector] }).engine.analyze(contextFixture());
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.id, second.id);
});

test('fixed clock and ID generator control timestamps and identities', async () => {
  const { engine, clock } = setup();
  clock.advance(50);
  const report = await engine.analyze(contextFixture());
  assert.equal(report.id, 'report_1');
  assert.equal(report.startedAt, '2026-07-29T10:00:00.050Z');
  assert.equal(report.completedAt, report.startedAt);
});

test('engine resolves category knowledge and capability packs without core changes', async () => {
  let observedKnowledge: readonly string[] = [];
  let observedCapabilities: readonly string[] = [];
  const detector = detectorFixture({
    metadata: { requiredCapabilities: ['capability-generic'] },
    execute: (context) => {
      observedKnowledge = context.knowledgePackIds;
      observedCapabilities = context.capabilityPackIds;
      return { issues: [], warnings: [], metrics: {}, metadata: {} };
    },
  });
  const { engine } = setup({ detectors: [detector], withPacks: true });
  await engine.analyze(contextFixture());
  assert.deepEqual(observedKnowledge, ['knowledge-generic']);
  assert.deepEqual(observedCapabilities, ['capability-generic']);
});

test('engine preserves caller input and isolates detectors from mutable product data', async () => {
  const context = contextFixture();
  const before = JSON.stringify(context);
  const detector = detectorFixture({ execute: (received) => {
    assert.equal(Object.isFrozen(received.products), true);
    assert.throws(() => {
      (received.products[0] as { title: string }).title = 'Mutated';
    });
    return { issues: [], warnings: [], metrics: {}, metadata: {} };
  } });
  const { engine } = setup({ detectors: [detector] });
  await engine.analyze(context);
  assert.equal(JSON.stringify(context), before);
});
