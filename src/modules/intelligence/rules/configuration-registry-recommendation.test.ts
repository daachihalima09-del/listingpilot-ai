import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { CapabilityPackRegistry } from '../packs/capability.ts';
import {
  createDeterministicRuleConfiguration,
  type DeterministicRuleConfigurationInput,
} from './configuration.ts';
import { createDeterministicQualityCapabilityPack } from './capability.ts';
import {
  DEFAULT_DETERMINISTIC_RULE_DEFINITIONS,
  DETERMINISTIC_RULE_IDS,
} from './definitions.ts';
import {
  createDefaultDeterministicRuleRegistry,
  createDeterministicRuleBundle,
} from './factory.ts';
import { evaluateRuleQualityStatus } from './quality-status.ts';
import { DeterministicRuleRecommendationStrategy } from './recommendations.ts';
import {
  evaluateRuleIssues,
  issuesForRule,
  ruleContextFixture,
  validRuleProductFixture,
} from '../testing/rule-fixtures.ts';
import { issueFixture } from '../testing/fixtures.ts';

test('default configuration is validated, detached, and deeply immutable', () => {
  const input: DeterministicRuleConfigurationInput = { seoTitle: { maximumLength: 80 } };
  const configuration = createDeterministicRuleConfiguration(input);
  (input.seoTitle as { maximumLength?: number }).maximumLength = 10;
  assert.equal(configuration.seoTitle.maximumLength, 80);
  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(Object.isFrozen(configuration.duplicateDetection), true);
  assert.throws(() => {
    (configuration.tags as { maximumCount: number }).maximumCount = 1;
  });
});

test('configuration rejects negative and inverted thresholds', () => {
  assert.throws(
    () => createDeterministicRuleConfiguration({ description: { minimumLength: -1 } }),
    /non-negative/,
  );
  assert.throws(
    () => createDeterministicRuleConfiguration({ tags: { maximumCount: -1 } }),
    /non-negative/,
  );
  assert.throws(
    () => createDeterministicRuleConfiguration({
      seoTitle: { minimumLength: 20, maximumLength: 10 },
    }),
    /cannot exceed/,
  );
});

test('unsupported comparison modes fail clearly', () => {
  assert.throws(
    () => createDeterministicRuleConfiguration({
      description: { duplicateComparisonMode: 'UNSUPPORTED' as never },
    }),
    /Unsupported description comparison mode/,
  );
  assert.throws(
    () => createDeterministicRuleConfiguration({
      duplicateDetection: { mediaUrlNormalization: 'UNSUPPORTED' as never },
    }),
    /Unsupported media URL normalization mode/,
  );
});

test('all production rules have unique stable IDs, issue codes, and version 1.0.0', () => {
  assert.equal(new Set(DETERMINISTIC_RULE_IDS).size, DETERMINISTIC_RULE_IDS.length);
  assert.equal(
    new Set(DEFAULT_DETERMINISTIC_RULE_DEFINITIONS.map(({ issueCode }) => issueCode)).size,
    DEFAULT_DETERMINISTIC_RULE_DEFINITIONS.length,
  );
  assert.equal(DEFAULT_DETERMINISTIC_RULE_DEFINITIONS.every(({ version }) => version === '1.0.0'), true);
  assert.equal(DEFAULT_DETERMINISTIC_RULE_DEFINITIONS.every(({ deterministic }) => deterministic), true);
});

test('default rule registry exposes every rule in deterministic order', () => {
  const registry = createDefaultDeterministicRuleRegistry();
  const snapshot = registry.snapshot();
  assert.equal(snapshot.length, DETERMINISTIC_RULE_IDS.length);
  assert.deepEqual(snapshot.map(({ id }) => id), [...DETERMINISTIC_RULE_IDS].sort());
});

test('rules can be disabled and re-enabled without changing definitions', () => {
  const registry = createDefaultDeterministicRuleRegistry();
  registry.disable('product.title.missing');
  const disabled = createDeterministicRuleBundle({
    hasher: new DeterministicHasher(),
    registry,
  }).detectors.flatMap((detector) => detector.execute(ruleContextFixture([
    validRuleProductFixture({ title: '' }),
  ])).issues);
  assert.equal(issuesForRule(disabled, 'product.title.missing').length, 0);
  registry.enable('product.title.missing');
  const enabled = createDeterministicRuleBundle({
    hasher: new DeterministicHasher(),
    registry,
  }).detectors.flatMap((detector) => detector.execute(ruleContextFixture([
    validRuleProductFixture({ title: '' }),
  ])).issues);
  assert.equal(issuesForRule(enabled, 'product.title.missing').length, 1);
});

test('rule registry category and scope filters retain version visibility', () => {
  const registry = createDefaultDeterministicRuleRegistry();
  const seo = registry.filter({
    category: 'SEO',
    scope: 'SINGLE_PRODUCT',
    capabilityPackIds: ['deterministic-quality'],
  });
  assert.equal(seo.length > 0, true);
  assert.equal(seo.every(({ category, version }) => category === 'SEO' && version === '1.0.0'), true);
});

test('deterministic quality capability registers with stable metadata', () => {
  const registry = new CapabilityPackRegistry();
  const capability = createDeterministicQualityCapabilityPack();
  registry.register(capability);
  assert.equal(capability.id, 'deterministic-quality');
  assert.equal(capability.version, '1.0.0');
  assert.equal(capability.compatibilityMetadata.deterministic, true);
  assert.equal(registry.snapshot()[0].enabled, true);
});

test('bundle explicitly supplies configuration, registry, detectors, capability, and recommendations', () => {
  const bundle = createDeterministicRuleBundle({ hasher: new DeterministicHasher() });
  assert.equal(bundle.detectors.length, 8);
  assert.equal(bundle.capabilityPack.id, 'deterministic-quality');
  assert.equal(bundle.ruleRegistry.snapshot().length, DETERMINISTIC_RULE_IDS.length);
  assert.equal(bundle.recommendationStrategy.id, 'deterministic-rule-guidance');
});

test('every deterministic issue produces actionable guidance without generated content', () => {
  const product = validRuleProductFixture({
    title: '',
    description: undefined,
    vendor: '',
    productType: '',
    status: undefined,
    tags: ['', 'same', 'same'],
    variants: [],
    media: [],
    seo: { title: '', description: '', handle: '', evidenceIds: [] },
    specifications: [{ key: '', label: '', valueType: 'STRING', evidenceIds: [] }],
  });
  const issues = evaluateRuleIssues({ products: [product] });
  const strategy = new DeterministicRuleRecommendationStrategy(
    createDefaultDeterministicRuleRegistry(),
    new DeterministicHasher(),
  );
  const recommendations = strategy.recommend(issues, ruleContextFixture([product]));
  assert.equal(recommendations.length, issues.length);
  assert.equal(recommendations.every(({ explanation }) => explanation.trim().length > 0), true);
  assert.equal(recommendations.every(({ proposedValues }) => proposedValues.length === 0), true);
  assert.equal(recommendations.every(({ metadata }) => metadata.generatedContent === false), true);
});

test('recommendation IDs, traceability, and policy metadata are deterministic', () => {
  const registry = createDefaultDeterministicRuleRegistry();
  const strategy = new DeterministicRuleRecommendationStrategy(registry, new DeterministicHasher());
  const issues = evaluateRuleIssues({
    products: [validRuleProductFixture({ title: '' })],
  });
  const context = ruleContextFixture([validRuleProductFixture({ title: '' })]);
  const first = strategy.recommend(issues, context);
  const second = strategy.recommend(issues, context);
  assert.equal(first[0].id, second[0].id);
  assert.deepEqual(first[0].issueIds, [issues[0].id]);
  assert.equal(first[0].approvalRequirement, 'MERCHANT');
  assert.equal(first[0].automationCapability, 'SUGGEST_ONLY');
  assert.equal(first[0].priority, 'URGENT');
  assert.equal(first[0].estimatedImpact, 'HIGH');
  assert.equal(first[0].riskLevel, 'MEDIUM');
});

test('quality gate returns PASS for no issues and empty catalogs', () => {
  assert.equal(evaluateRuleQualityStatus([]).status, 'PASS');
});

test('quality gate returns PASS_WITH_WARNINGS for issues below threshold', () => {
  assert.equal(evaluateRuleQualityStatus([
    issueFixture({ severity: 'LOW' }),
    issueFixture({ id: 'issue-2', severity: 'MEDIUM' }),
  ], 'HIGH').status, 'PASS_WITH_WARNINGS');
});

test('quality gate returns FAIL at or above configured threshold', () => {
  assert.equal(evaluateRuleQualityStatus([issueFixture({ severity: 'HIGH' })]).status, 'FAIL');
  assert.equal(evaluateRuleQualityStatus([issueFixture({ severity: 'MEDIUM' })], 'MEDIUM').status, 'FAIL');
  assert.equal(evaluateRuleQualityStatus([issueFixture({ severity: 'MEDIUM' })], 'CRITICAL').status, 'PASS_WITH_WARNINGS');
});

test('quality status is deterministic and reports counts', () => {
  const issues = [
    issueFixture({ severity: 'LOW' }),
    issueFixture({ id: 'issue-2', severity: 'HIGH' }),
  ];
  const first = evaluateRuleQualityStatus(issues);
  const second = evaluateRuleQualityStatus(issues);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    status: 'FAIL',
    failureSeverity: 'HIGH',
    issueCount: 2,
    failingIssueCount: 1,
    warningIssueCount: 1,
  });
});
