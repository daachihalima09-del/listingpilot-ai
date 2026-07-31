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
import type { NormalizedProduct } from '../domain/types.ts';
import {
  createDefaultDeterministicRuleRegistry,
  createDeterministicRuleBundle,
} from './factory.ts';
import { evaluateRuleQualityStatus } from './quality-status.ts';
import {
  ruleContextFixture,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';

function setup(disabledRuleIds: readonly string[] = []) {
  const hasher = new DeterministicHasher();
  const rules = createDefaultDeterministicRuleRegistry();
  for (const id of disabledRuleIds) rules.disable(id);
  const bundle = createDeterministicRuleBundle({ hasher, registry: rules });
  const detectors = new DetectorRegistry();
  for (const detector of bundle.detectors) detectors.register(detector);
  const capabilities = new CapabilityPackRegistry();
  capabilities.register(bundle.capabilityPack);
  const strategies = new RecommendationStrategyRegistry();
  strategies.register(bundle.recommendationStrategy);
  const ids = new SequenceIdGenerator();
  const clock = new FixedIntelligenceClock('2026-07-29T10:00:00.000Z');
  const engine = new IntelligenceEngine({
    detectorRegistry: detectors,
    knowledgePackRegistry: new KnowledgePackRegistry(),
    capabilityPackRegistry: capabilities,
    recommendationEngine: new RecommendationEngine(strategies, ids, hasher),
    confidenceStrategy: new NeutralConfidenceStrategy(),
    runtime: { hasher, ids, clock },
  }, {
    engineVersion: '7.2.0',
    reportSchemaVersion: '1',
  });
  return { engine, bundle };
}

test('empty catalog runs through IntelligenceEngine and passes quality gate', async () => {
  const { engine } = setup();
  const report = await engine.analyze(ruleContextFixture([], {
    analysisScope: 'FULL_CATALOG',
    capabilityPackIds: [],
  }));
  assert.equal(report.productCount, 0);
  assert.equal(report.issues.length, 0);
  assert.equal(evaluateRuleQualityStatus(report.issues).status, 'PASS');
});

test('single valid product produces no deterministic rule issues', async () => {
  const { engine } = setup();
  const report = await engine.analyze(ruleContextFixture([validRuleProductFixture()], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  }));
  assert.equal(report.issues.length, 0);
  assert.equal(report.recommendations.length, 0);
});

test('single invalid product produces issues and recommendations through the existing engine', async () => {
  const product = validRuleProductFixture({
    title: '',
    vendor: '',
    variants: [],
    media: [],
    seo: { title: '', description: '', handle: '', evidenceIds: [] },
  });
  const { engine } = setup();
  const report = await engine.analyze(ruleContextFixture([product], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  }));
  assert.equal(report.issues.length > 0, true);
  assert.equal(report.recommendations.length, report.issues.length);
  assert.equal(evaluateRuleQualityStatus(report.issues).status, 'FAIL');
});

test('selected and full-catalog scopes detect only supplied duplicates', async () => {
  const first = validRuleProductFixture({ id: 'p1', title: 'Duplicate', seo: { ...validRuleProductFixture().seo, handle: 'one' } });
  const second = validRuleProductFixture({ id: 'p2', title: 'Duplicate', seo: { ...validRuleProductFixture().seo, handle: 'two' } });
  const selected = await setup().engine.analyze(ruleContextFixture([first], {
    analysisScope: 'SELECTED_PRODUCTS',
    capabilityPackIds: [],
  }));
  const catalog = await setup().engine.analyze(ruleContextFixture([first, second], {
    analysisScope: 'FULL_CATALOG',
    capabilityPackIds: [],
  }));
  assert.equal(selected.issues.some(({ metadata }) => metadata.ruleId === 'catalog.product.title.duplicate'), false);
  assert.equal(catalog.issues.some(({ metadata }) => metadata.ruleId === 'catalog.product.title.duplicate'), true);
});

test('disabled production rules do not execute through IntelligenceEngine', async () => {
  const { engine } = setup(['product.title.missing']);
  const report = await engine.analyze(ruleContextFixture([
    validRuleProductFixture({ title: '' }),
  ], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  }));
  assert.equal(report.issues.some(({ metadata }) => metadata.ruleId === 'product.title.missing'), false);
});

test('rule reports aggregate detector and category statistics', async () => {
  const { engine, bundle } = setup();
  const report = await engine.analyze(ruleContextFixture([
    validRuleProductFixture({ title: '', variants: [] }),
  ], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  }));
  assert.equal(report.detectorStatistics.length, bundle.detectors.length);
  assert.equal(report.categoryStatistics.DATA_QUALITY > 0, true);
  assert.equal(report.categoryStatistics.VARIANT > 0, true);
  assert.equal(report.detectorStatistics.every(({ status }) => status === 'COMPLETED'), true);
  assert.equal(report.warnings.length, 0);
});

test('same input produces identical issue fingerprints and report fingerprint', async () => {
  const context = ruleContextFixture([
    validRuleProductFixture({ title: '', variants: [] }),
  ], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  });
  const first = await setup().engine.analyze(context);
  const second = await setup().engine.analyze(context);
  assert.deepEqual(first.issues.map(({ fingerprint }) => fingerprint), second.issues.map(({ fingerprint }) => fingerprint));
  assert.equal(first.fingerprint, second.fingerprint);
});

test('engine preserves malformed caller input immutably while producing issues', async () => {
  const product = validRuleProductFixture({
    title: '',
    variants: [
      { ...validRuleProductFixture().variants[0], id: 'same', sku: 'one', price: 'bad' },
      { ...validRuleProductFixture().variants[0], id: 'same', sku: 'two', price: '-1' },
    ],
    media: [{ ...validRuleProductFixture().media[0], position: -1 }],
    specifications: [{ ...validRuleProductFixture().specifications[0], key: '' }],
  });
  const context = ruleContextFixture([product], {
    analysisScope: 'SINGLE_PRODUCT',
    capabilityPackIds: [],
  });
  const before = JSON.stringify(context);
  const report = await setup().engine.analyze(context);
  assert.equal(JSON.stringify(context), before);
  assert.equal(Object.isFrozen(report), true);
  for (const ruleId of [
    'product.title.missing',
    'variant.id.duplicate',
    'variant.price.invalid',
    'variant.price.negative',
    'media.position.invalid',
    'specification.key.missing',
  ]) {
    assert.equal(report.issues.some(({ metadata }) => metadata.ruleId === ruleId), true, ruleId);
  }
});

function largeCatalog(size: number): readonly NormalizedProduct[] {
  const base = validRuleProductFixture();
  return Array.from({ length: size }, (_, index) => validRuleProductFixture({
    id: `product-${index}`,
    title: `Product ${index}`,
    description: `A unique detailed normalized product description for product ${index} with enough text to pass the configured threshold.`,
    variants: [{
      ...base.variants[0],
      id: `variant-${index}`,
      sku: `SKU-${index % (size / 2)}`,
      barcode: `BARCODE-${index}`,
    }],
    media: [{
      ...base.media[0],
      id: `media-${index}`,
      url: `https://example.test/media/${index}.jpg`,
    }],
    seo: {
      ...base.seo,
      title: `Product ${index}`,
      description: `A unique SEO description for product ${index} that is sufficiently detailed for deterministic validation.`,
      handle: `product-${index}`,
    },
  }));
}

test('map-based duplicate grouping handles thousands of products', async () => {
  const products = largeCatalog(2_000);
  const report = await setup().engine.analyze(ruleContextFixture(products, {
    analysisScope: 'FULL_CATALOG',
    capabilityPackIds: [],
    options: {
      ...ruleContextFixture([]).options,
      detectorTimeoutMs: 20_000,
      globalTimeoutMs: 60_000,
    },
  }));
  const duplicateSkuIssues = report.issues.filter(
    ({ metadata }) => metadata.ruleId === 'variant.sku.duplicate',
  );
  assert.equal(duplicateSkuIssues.length, 1_000);
  assert.equal(report.productCount, 2_000);
});

test('large-catalog output remains deterministic', async () => {
  const products = largeCatalog(1_000);
  const context = ruleContextFixture(products, {
    analysisScope: 'FULL_CATALOG',
    capabilityPackIds: [],
    options: {
      ...ruleContextFixture([]).options,
      detectorTimeoutMs: 20_000,
      globalTimeoutMs: 60_000,
    },
  });
  const first = await setup().engine.analyze(context);
  const second = await setup().engine.analyze(context);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.issues.map(({ id }) => id), second.issues.map(({ id }) => id));
});
