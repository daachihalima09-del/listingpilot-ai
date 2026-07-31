import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductTruthConfiguration } from './configuration.ts';
import {
  GenericTruthValueComparisonStrategy,
  normalizeTruthValue,
} from './normalization.ts';
import type { ValueType } from '../domain/types.ts';

function normalize(
  value: unknown,
  valueType: ValueType = 'STRING',
  input: {
    unit?: string;
    configuration?: Parameters<typeof createProductTruthConfiguration>[0];
    namespace?: string;
    key?: string;
  } = {},
) {
  return normalizeTruthValue({
    namespace: input.namespace ?? 'generic',
    key: input.key ?? 'value',
    value,
    valueType,
    unit: input.unit,
    configuration: createProductTruthConfiguration(input.configuration),
  });
}

test('normalized strings use Unicode-safe trimming and whitespace collapse', () => {
  assert.equal(normalize('  Café   Product  ').canonicalValue, 'café product');
  assert.equal(normalize('Cafe\u0301').canonicalValue, 'café');
});

test('case-sensitive policy preserves string casing', () => {
  const upper = normalize('Example', 'STRING', {
    configuration: { stringNormalization: { caseSensitive: true } },
  });
  const lower = normalize('example', 'STRING', {
    configuration: { stringNormalization: { caseSensitive: true } },
  });
  assert.notEqual(upper.canonicalValue, lower.canonicalValue);
});

test('exact decimal normalization avoids floating-point conversion', () => {
  assert.equal(normalize('0019.9900', 'DECIMAL').canonicalValue, '19.99');
  assert.equal(normalize('-0.000', 'DECIMAL').canonicalValue, '0');
  assert.equal(normalize('900719925474099312345.1000', 'DECIMAL').canonicalValue, '900719925474099312345.1');
});

test('integer normalization is exact and rejects locale formatting', () => {
  assert.equal(normalize('00042', 'INTEGER').canonicalValue, '42');
  assert.equal(normalize('1,000', 'INTEGER').usable, false);
});

test('boolean aliases normalize deterministically', () => {
  assert.equal(normalize('YES', 'BOOLEAN').canonicalValue, 'true');
  assert.equal(normalize('0', 'BOOLEAN').canonicalValue, 'false');
  assert.equal(normalize('perhaps', 'BOOLEAN').usable, false);
});

test('canonical units require explicit supplied aliases', () => {
  const configuration = { unitAliases: { hertz: 'hz', HZ: 'hz' } };
  assert.equal(normalize('120', 'DECIMAL', { unit: 'hertz', configuration }).canonicalValue, '120|hz');
  assert.equal(normalize('120', 'DECIMAL', { unit: 'Hz', configuration }).canonicalValue, '120|hz');
});

test('120, 120Hz, and 120 Hz are not guessed equivalent without unit metadata', () => {
  const plain = normalize('120', 'STRING');
  const joined = normalize('120Hz', 'STRING');
  const spaced = normalize('120 Hz', 'STRING');
  assert.notEqual(plain.canonicalValue, joined.canonicalValue);
  assert.notEqual(joined.canonicalValue, spaced.canonicalValue);
});

test('unordered lists sort only when explicitly configured', () => {
  const configured = {
    unorderedListClaims: ['generic.features'],
  };
  const first = normalize(['Beta', 'Alpha'], 'LIST', {
    namespace: 'generic',
    key: 'features',
    configuration: configured,
  });
  const second = normalize(['Alpha', 'Beta'], 'LIST', {
    namespace: 'generic',
    key: 'features',
    configuration: configured,
  });
  assert.equal(first.canonicalValue, second.canonicalValue);
  assert.notEqual(
    normalize(['Beta', 'Alpha'], 'LIST').canonicalValue,
    normalize(['Alpha', 'Beta'], 'LIST').canonicalValue,
  );
});

test('unknown and object values remain deterministic without fuzzy inference', () => {
  assert.equal(
    normalize({ beta: 2, alpha: 1 }, 'OBJECT').canonicalValue,
    normalize({ alpha: 1, beta: 2 }, 'OBJECT').canonicalValue,
  );
  assert.equal(normalize('not understood', 'UNKNOWN').canonicalValue, 'not understood');
});

test('already-normalized dates remain exact and malformed shape is not inferred', () => {
  assert.equal(normalize('2026-07-29', 'DATE').canonicalValue, '2026-07-29');
  assert.equal(normalize(new Date('2026-07-29T00:00:00.000Z'), 'DATE').usable, false);
});

test('explicit value aliases support future Knowledge Pack canonical values', () => {
  const result = normalize('Manufacturer Alias', 'ENUM', {
    namespace: 'generic',
    key: 'mode',
    configuration: {
      valueAliases: {
        'generic.mode': { 'manufacturer alias': 'canonical-mode' },
      },
    },
  });
  assert.equal(result.canonicalValue, 'canonical-mode');
});

test('generic comparison recognizes equivalent canonical strings and decimals', () => {
  const strategy = new GenericTruthValueComparisonStrategy();
  assert.equal(strategy.compare(normalize(' Example '), normalize('example')).result, 'EQUIVALENT');
  assert.equal(strategy.compare(normalize('19.990', 'DECIMAL'), normalize('19.99', 'DECIMAL')).result, 'EQUIVALENT');
  assert.equal(strategy.compare(normalize('19', 'INTEGER'), normalize('19.0', 'DECIMAL')).result, 'COMPATIBLE');
});

test('generic comparison reports conflicts only for safely comparable values', () => {
  const strategy = new GenericTruthValueComparisonStrategy();
  assert.equal(strategy.compare(normalize('Alpha'), normalize('Beta')).result, 'CONFLICTING');
  assert.equal(
    strategy.compare(normalize('120', 'DECIMAL', { unit: 'hz' }), normalize('120', 'DECIMAL', { unit: 'rpm' })).result,
    'INCOMPARABLE',
  );
  assert.equal(strategy.compare(normalize('1', 'INTEGER'), normalize('true', 'BOOLEAN')).result, 'INCOMPARABLE');
});

test('configuration validates thresholds, aliases, and source policies', () => {
  assert.throws(() => createProductTruthConfiguration({ likelyThreshold: 0.9, verifiedThreshold: 0.8 }));
  assert.throws(() => createProductTruthConfiguration({
    booleanAliases: { trueValues: ['same'], falseValues: ['same'] },
  }));
  assert.throws(() => createProductTruthConfiguration({ sourceDiversityWeight: -1 }));
  assert.throws(() => createProductTruthConfiguration({
    minimumVerifiedEvidence: 0,
    minimumLikelyEvidence: 1,
  }));
  assert.throws(() => createProductTruthConfiguration({ claimAliases: { invalid: 'missing-namespace' } }));
  assert.throws(() => createProductTruthConfiguration({
    requiredEvidenceTypes: { 'product.title': [] },
  }));
});

test('configuration is deeply immutable and detached from caller input', () => {
  const aliases = { hz: 'hertz' };
  const configuration = createProductTruthConfiguration({ unitAliases: aliases });
  aliases.hz = 'changed';
  assert.equal(configuration.unitAliases.hz, 'hertz');
  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(Object.isFrozen(configuration.authorityWeights), true);
});
