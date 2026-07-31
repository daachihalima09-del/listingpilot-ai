import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntelligenceDomainError } from '../domain/errors.ts';
import { createRecommendationIntelligenceCapabilityPack } from './capability.ts';
import {
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
  RECOMMENDATION_INTELLIGENCE_VERSION,
  createRecommendationIntelligenceConfiguration,
} from './configuration.ts';
import {
  DEFAULT_RECOMMENDATION_RULE_DEFINITIONS,
  RecommendationRuleRegistry,
  createDefaultRecommendationRuleRegistry,
} from './rules.ts';

test('Recommendation Intelligence capability has stable identity and upstream dependencies', () => {
  const pack = createRecommendationIntelligenceCapabilityPack();
  assert.equal(pack.id, RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID);
  assert.equal(pack.version, RECOMMENDATION_INTELLIGENCE_VERSION);
  assert.deepEqual(pack.dependencies, [
    'deterministic-quality',
    'product-truth',
    'ai-detective',
  ]);
  assert.equal(pack.compatibilityMetadata.deterministic, true);
  assert.equal(pack.compatibilityMetadata.generatesFacts, false);
});

test('default configuration enables every generic recommendation category immutably', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  assert.deepEqual(configuration.enabledRecommendationCategories, [...RECOMMENDATION_CATEGORIES].sort());
  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(Object.isFrozen(configuration.groupingPolicies), true);
});

test('configuration deduplicates enabled categories and blocker policies', () => {
  const configuration = createRecommendationIntelligenceConfiguration({
    enabledRecommendationCategories: ['SEO', 'SEO', 'IDENTITY'],
    blockerPolicy: {
      issueCodePrefixes: ['truth.', 'truth.'],
      contradictionTypes: ['VALUE_CONFLICT', 'VALUE_CONFLICT'],
    },
  });
  assert.deepEqual(configuration.enabledRecommendationCategories, ['IDENTITY', 'SEO']);
  assert.deepEqual(configuration.blockerPolicy.issueCodePrefixes, ['truth.']);
  assert.deepEqual(configuration.blockerPolicy.contradictionTypes, ['VALUE_CONFLICT']);
});

test('configuration validates categories, levels, and ordered thresholds', () => {
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    enabledRecommendationCategories: ['UNKNOWN' as 'SEO'],
  }), IntelligenceDomainError);
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    minimumIncludedImpact: 'UNKNOWN' as 'LOW',
  }), IntelligenceDomainError);
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    priorityThresholds: { priority2Minimum: 200 },
  }), IntelligenceDomainError);
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    effortThresholds: { smallMaximumFields: 4, mediumMaximumFields: 2 },
  }), IntelligenceDomainError);
});

test('configuration validates blocker prefixes and unique grouping IDs', () => {
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    blockerPolicy: { issueCodePrefixes: [''] },
  }), IntelligenceDomainError);
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    groupingPolicies: {
      UNKNOWN: { name: 'Unknown' },
    } as never,
  }), IntelligenceDomainError);
  assert.throws(() => createRecommendationIntelligenceConfiguration({
    groupingPolicies: {
      SEO: { id: 'duplicate' },
      MEDIA: { id: 'duplicate' },
    },
  }), IntelligenceDomainError);
});

test('default rule registry exposes stable versioned definitions', () => {
  const registry = createDefaultRecommendationRuleRegistry();
  assert.equal(registry.snapshot().length, DEFAULT_RECOMMENDATION_RULE_DEFINITIONS.length);
  assert.equal(registry.snapshot().every(({ version }) => version === '1.0.0'), true);
  assert.deepEqual(
    registry.snapshot().map(({ id }) => id),
    [...registry.snapshot().map(({ id }) => id)].sort(),
  );
});

test('rule matching prefers upstream-specific rules before generic categories', () => {
  const registry = createDefaultRecommendationRuleRegistry();
  const detective = registry.match({
    issueCategory: 'PRODUCT_TRUTH',
    issueCode: 'detective.value_conflict',
    ruleId: 'detective.truth.value-conflict',
    detectorId: 'ai-detective.truth-conflict',
    severity: 'HIGH',
  });
  const truth = registry.match({
    issueCategory: 'PRODUCT_TRUTH',
    issueCode: 'truth.claim.conflicted',
    ruleId: '',
    detectorId: 'product-truth.analysis',
    severity: 'HIGH',
  });
  assert.equal(detective?.category, 'CONTRADICTION');
  assert.equal(truth?.category, 'PRODUCT_TRUTH');
});

test('critical deterministic issues use the publishing-readiness rule', () => {
  const rule = createDefaultRecommendationRuleRegistry().match({
    issueCategory: 'PRICING',
    issueCode: 'VARIANT_PRICE_MISSING',
    ruleId: 'variant.price.missing',
    detectorId: 'rules.variant',
    severity: 'CRITICAL',
  });
  assert.equal(rule?.category, 'PUBLISHING_READINESS');
  assert.equal(rule?.blockingPolicy.alwaysBlocker, true);
});

test('identity matching remains declarative through stable rule prefixes', () => {
  const rule = createDefaultRecommendationRuleRegistry().match({
    issueCategory: 'VARIANT',
    issueCode: 'VARIANT_SKU_MISSING',
    ruleId: 'variant.sku.missing',
    detectorId: 'rules.variant',
    severity: 'HIGH',
  });
  assert.equal(rule?.category, 'IDENTITY');
  assert.deepEqual(rule?.dependsOnCategories, ['PRODUCT_TRUTH', 'CONTRADICTION']);
});

test('registry enable, disable, duplicate, and missing-ID behavior is explicit', () => {
  const registry = createDefaultRecommendationRuleRegistry();
  registry.disable('recommendation.seo');
  const matched = registry.match({
    issueCategory: 'SEO',
    issueCode: 'SEO_TITLE_MISSING',
    ruleId: 'seo.title.missing',
    detectorId: 'rules.seo',
    severity: 'MEDIUM',
  });
  assert.equal(matched, undefined);
  registry.enable('recommendation.seo');
  assert.equal(registry.get('recommendation.seo')?.category, 'SEO');
  assert.throws(
    () => registry.register(DEFAULT_RECOMMENDATION_RULE_DEFINITIONS[0]),
    IntelligenceDomainError,
  );
  assert.throws(() => new RecommendationRuleRegistry().disable('missing'), IntelligenceDomainError);
  assert.throws(() => new RecommendationRuleRegistry().register({
    ...DEFAULT_RECOMMENDATION_RULE_DEFINITIONS[0],
    id: 'invalid',
    category: 'UNKNOWN' as 'SEO',
  }), IntelligenceDomainError);
});
