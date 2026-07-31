import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IntelligenceDomainError } from '../domain/errors.ts';
import {
  AI_DETECTIVE_CAPABILITY_ID,
  AI_DETECTIVE_VERSION,
  CONTRADICTION_TYPES,
  createAIDetectiveConfiguration,
} from './configuration.ts';
import { createAIDetectiveCapabilityPack } from './capability.ts';
import {
  ContradictionRuleRegistry,
  DEFAULT_CONTRADICTION_RULE_DEFINITIONS,
  createDefaultContradictionRuleRegistry,
  type ContradictionRuleDefinition,
} from './rules.ts';

function combinationRule(
  overrides: Partial<ContradictionRuleDefinition> = {},
): ContradictionRuleDefinition {
  return {
    id: 'test.combination',
    version: '1.0.0',
    name: 'Test combination',
    description: 'A data-driven test contradiction.',
    contradictionType: 'IMPOSSIBLE_COMBINATION',
    severity: 'CRITICAL',
    enabled: true,
    deterministic: true,
    explanationTemplate: '{leftField} conflicts with {rightField}.',
    recommendationTemplate: 'Review both facts.',
    detectorFamily: 'combination',
    combination: {
      left: {
        source: 'NORMALIZED_FIELD',
        fieldPath: 'status',
        operator: 'EQUALS',
        value: 'ACTIVE',
      },
      right: {
        source: 'NORMALIZED_FIELD',
        fieldPath: 'attributes.discontinued',
        operator: 'EQUALS',
        value: true,
      },
    },
    metadata: {},
    ...overrides,
  };
}

test('AI Detective capability identity and Product Truth dependency are stable', () => {
  const pack = createAIDetectiveCapabilityPack();
  assert.equal(pack.id, AI_DETECTIVE_CAPABILITY_ID);
  assert.equal(pack.version, AI_DETECTIVE_VERSION);
  assert.deepEqual(pack.dependencies, ['product-truth']);
  assert.equal(pack.compatibilityMetadata.deterministic, true);
});

test('configuration enables every generic contradiction category by default', () => {
  const configuration = createAIDetectiveConfiguration();
  assert.deepEqual(configuration.enabledContradictionTypes, [...CONTRADICTION_TYPES].sort());
  assert.deepEqual(configuration.blockingContradictionTypes, ['IMPOSSIBLE_COMBINATION']);
  assert.equal(Object.isFrozen(configuration), true);
});

test('configuration normalizes duplicate values deterministically', () => {
  const configuration = createAIDetectiveConfiguration({
    enabledContradictionTypes: ['WEAK_EVIDENCE', 'VALUE_CONFLICT', 'WEAK_EVIDENCE'],
    blockingContradictionTypes: ['VALUE_CONFLICT', 'VALUE_CONFLICT'],
    duplicateIdentityFields: ['sku', 'sku'],
  });
  assert.deepEqual(configuration.enabledContradictionTypes, ['VALUE_CONFLICT', 'WEAK_EVIDENCE']);
  assert.deepEqual(configuration.blockingContradictionTypes, ['VALUE_CONFLICT']);
  assert.deepEqual(configuration.duplicateIdentityFields, ['sku']);
});

test('configuration rejects confidence thresholds outside the unit interval', () => {
  assert.throws(() => createAIDetectiveConfiguration({
    confidenceThresholds: { VALUE_CONFLICT: 1.01 },
  }), IntelligenceDomainError);
});

test('configuration rejects unsupported contradiction types', () => {
  assert.throws(() => createAIDetectiveConfiguration({
    enabledContradictionTypes: ['UNKNOWN' as 'VALUE_CONFLICT'],
  }), IntelligenceDomainError);
});

test('configuration rejects invalid severity, truth status, and identity policies', () => {
  assert.throws(() => createAIDetectiveConfiguration({
    minimumSeverity: 'INVALID' as 'LOW',
  }), IntelligenceDomainError);
  assert.throws(() => createAIDetectiveConfiguration({
    truthListingStatuses: ['INVALID' as 'VERIFIED'],
  }), IntelligenceDomainError);
  assert.throws(() => createAIDetectiveConfiguration({
    duplicateIdentityFields: ['invalid' as 'sku'],
  }), IntelligenceDomainError);
});

test('default registry exposes stable, deterministic rule metadata', () => {
  const registry = createDefaultContradictionRuleRegistry();
  assert.equal(registry.snapshot().length, DEFAULT_CONTRADICTION_RULE_DEFINITIONS.length);
  assert.equal(registry.filter().every(({ deterministic }) => deterministic), true);
  assert.deepEqual(registry.snapshot().map(({ id }) => id), [...registry.snapshot().map(({ id }) => id)].sort());
});

test('registry rejects duplicate and malformed rule registrations', () => {
  const registry = new ContradictionRuleRegistry();
  registry.register(combinationRule());
  assert.throws(() => registry.register(combinationRule()), IntelligenceDomainError);
  assert.throws(() => new ContradictionRuleRegistry().register(combinationRule({
    id: '',
  })), IntelligenceDomainError);
  assert.throws(() => new ContradictionRuleRegistry().register(combinationRule({
    combination: undefined,
  })), IntelligenceDomainError);
});

test('registry supports independent enable and disable controls', () => {
  const registry = new ContradictionRuleRegistry();
  registry.register(combinationRule());
  registry.disable('test.combination');
  assert.deepEqual(registry.filter(), []);
  assert.equal(registry.snapshot()[0].enabled, false);
  registry.enable('test.combination');
  assert.equal(registry.filter().length, 1);
});

test('registry filters rule families and contradiction types', () => {
  const registry = createDefaultContradictionRuleRegistry();
  assert.equal(registry.filter({ family: 'identity-conflict' }).length, 2);
  assert.deepEqual(
    [...new Set(registry.filter({ types: ['VALUE_CONFLICT'] }).map(({ contradictionType }) => contradictionType))],
    ['VALUE_CONFLICT'],
  );
});

test('combination rules carry facts instead of embedding category-specific logic', () => {
  const rule = combinationRule();
  assert.equal(rule.combination?.left.fieldPath, 'status');
  assert.equal(rule.combination?.right.fieldPath, 'attributes.discontinued');
  assert.equal(JSON.stringify(rule).includes('television'), false);
});
