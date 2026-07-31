import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DetectorRegistry } from './detectors/registry.ts';
import { EvidenceProviderRegistry } from './evidence/provider.ts';
import { CapabilityPackRegistry } from './packs/capability.ts';
import { KnowledgePackRegistry } from './packs/knowledge.ts';
import { RuleRegistry } from './rules/registry.ts';
import {
  capabilityPackFixture,
  detectorFixture,
  knowledgePackFixture,
} from './testing/fixtures.ts';

test('detector registry registers and retrieves versioned detectors', () => {
  const registry = new DetectorRegistry();
  registry.register(detectorFixture());
  assert.equal(registry.get('detector-1')?.metadata.version, '1.0.0');
});

test('detector registry rejects duplicate IDs', () => {
  const registry = new DetectorRegistry();
  registry.register(detectorFixture());
  assert.throws(() => registry.register(detectorFixture()), /already registered/);
});

test('detector registry filters by category, capability, knowledge, and scope', () => {
  const registry = new DetectorRegistry();
  registry.register(detectorFixture({
    metadata: {
      issueCategories: ['SEO'],
      requiredCapabilities: ['capability-seo'],
      compatibleKnowledgePacks: ['knowledge-generic'],
      supportedScopes: ['SINGLE_PRODUCT'],
    },
  }));
  assert.equal(registry.byCategory('SEO').length, 1);
  assert.equal(registry.byCapability('capability-seo').length, 1);
  assert.equal(registry.byKnowledgePack('knowledge-generic').length, 1);
  assert.equal(registry.byScope('SINGLE_PRODUCT').length, 1);
  assert.equal(registry.byScope('FULL_CATALOG').length, 0);
});

test('detector order is deterministic by priority then ID', () => {
  const registry = new DetectorRegistry();
  registry.register(detectorFixture({ id: 'z-detector', priority: 20 }));
  registry.register(detectorFixture({ id: 'b-detector', priority: 10 }));
  registry.register(detectorFixture({ id: 'a-detector', priority: 10 }));
  assert.deepEqual(registry.snapshot().map(({ id }) => id), [
    'a-detector',
    'b-detector',
    'z-detector',
  ]);
});

test('detector enable and disable behavior is explicit and visible in snapshots', () => {
  const registry = new DetectorRegistry();
  registry.register(detectorFixture());
  registry.disable('detector-1');
  assert.equal(registry.snapshot()[0].enabled, false);
  assert.equal(registry.byCategory('DATA_QUALITY').length, 0);
  registry.enable('detector-1');
  assert.equal(registry.snapshot()[0].enabled, true);
});

test('knowledge packs register, expose versions, and match categories and aliases', () => {
  const registry = new KnowledgePackRegistry();
  registry.register(knowledgePackFixture());
  assert.equal(registry.get('knowledge-generic')?.version, '1.0.0');
  assert.equal(registry.matchCategory('generic').length, 1);
  assert.equal(registry.matchCategory('GENERAL').length, 1);
  assert.equal(registry.snapshot()[0].version, '1.0.0');
});

test('knowledge registry rejects duplicates and honors enable state', () => {
  const registry = new KnowledgePackRegistry();
  registry.register(knowledgePackFixture());
  assert.throws(() => registry.register(knowledgePackFixture()), /already registered/);
  registry.disable('knowledge-generic');
  assert.equal(registry.matchCategory('generic').length, 0);
  registry.enable('knowledge-generic');
  assert.equal(registry.matchCategory('generic').length, 1);
});

test('knowledge registration validates dependencies and resolves dependency order', () => {
  const registry = new KnowledgePackRegistry();
  assert.throws(
    () => registry.register(knowledgePackFixture({ id: 'dependent', dependencies: ['missing'] })),
    /registered first/,
  );
  registry.register(knowledgePackFixture({ id: 'base' }));
  registry.register(knowledgePackFixture({ id: 'dependent', dependencies: ['base'] }));
  assert.deepEqual(registry.resolve().map(({ id }) => id), ['base', 'dependent']);
});

test('knowledge compatibility lookup requires caller metadata to match', () => {
  const registry = new KnowledgePackRegistry();
  registry.register(knowledgePackFixture({ compatibilityMetadata: { region: 'global' } }));
  assert.equal(registry.compatibleWith({ region: 'global' }).length, 1);
  assert.equal(registry.compatibleWith({ region: 'eu' }).length, 0);
});

test('capability packs register in deterministic dependency order', () => {
  const registry = new CapabilityPackRegistry();
  registry.register(capabilityPackFixture({ id: 'base' }));
  registry.register(capabilityPackFixture({ id: 'dependent', dependencies: ['base'] }));
  assert.deepEqual(registry.resolve().map(({ id }) => id), ['base', 'dependent']);
  assert.deepEqual(registry.snapshot()[1].dependencies, ['base']);
});

test('capability registration rejects missing dependencies and duplicates', () => {
  const registry = new CapabilityPackRegistry();
  assert.throws(
    () => registry.register(capabilityPackFixture({ id: 'dependent', dependencies: ['missing'] })),
    /registered first/,
  );
  registry.register(capabilityPackFixture());
  assert.throws(() => registry.register(capabilityPackFixture()), /already registered/);
});

test('capability enabling validates dependency state', () => {
  const registry = new CapabilityPackRegistry();
  registry.register(capabilityPackFixture({ id: 'base' }));
  registry.register(capabilityPackFixture({ id: 'dependent', dependencies: ['base'], enabled: false }));
  registry.disable('base');
  assert.throws(() => registry.enable('dependent'), /dependency is disabled/);
});

test('evidence provider registry remains metadata-only and filterable', () => {
  const registry = new EvidenceProviderRegistry();
  registry.register({
    id: 'provider-1',
    name: 'Fixture provider',
    version: '1.0.0',
    type: 'DOCUMENT',
    sourceTypes: ['DOCUMENT'],
    reliability: 'HIGH',
    supportedClaims: ['title'],
    capabilityCompatibility: ['capability-generic'],
    knowledgePackCompatibility: ['knowledge-generic'],
    metadata: {},
    enabled: true,
  });
  assert.equal(registry.resolve({
    sourceType: 'DOCUMENT',
    capabilityId: 'capability-generic',
    knowledgePackId: 'knowledge-generic',
  }).length, 1);
  assert.equal(registry.snapshot()[0].type, 'DOCUMENT');
  registry.disable('provider-1');
  assert.equal(registry.resolve({ sourceType: 'DOCUMENT' }).length, 0);
});

test('evidence provider registry rejects duplicate IDs', () => {
  const registry = new EvidenceProviderRegistry();
  const provider = {
    id: 'provider-1',
    name: 'Fixture provider',
    version: '1.0.0',
    type: 'OTHER' as const,
    sourceTypes: ['OTHER' as const],
    reliability: 'UNKNOWN' as const,
    supportedClaims: [],
    capabilityCompatibility: [],
    knowledgePackCompatibility: [],
    metadata: {},
    enabled: true,
  };
  registry.register(provider);
  assert.throws(() => registry.register(provider), /already registered/);
});

test('rule registry keeps rule and detector identities separate', () => {
  const registry = new RuleRegistry();
  registry.register({
    id: 'rule-1',
    name: 'Generic fixture rule',
    version: '1.0.0',
    description: 'Framework-only rule.',
    issueCode: 'FIXTURE_RULE',
    category: 'DATA_QUALITY',
    severity: 'LOW',
    supportedScopes: ['FULL_CATALOG'],
    affectedFields: ['title'],
    explanationTemplate: 'Fixture explanation.',
    recommendationTemplate: 'Review the fixture.',
    requiredKnowledgePacks: ['knowledge-generic'],
    requiredCapabilityPacks: ['capability-generic'],
    enabled: true,
    deterministic: true,
    metadata: {},
  });
  assert.equal(registry.filter({
    category: 'DATA_QUALITY',
    scope: 'FULL_CATALOG',
    knowledgePackIds: ['knowledge-generic'],
    capabilityPackIds: ['capability-generic'],
  }).length, 1);
  assert.equal(registry.snapshot()[0].version, '1.0.0');
});

test('rule enable, disable, duplicate prevention, and deterministic snapshots work', () => {
  const registry = new RuleRegistry();
  const rule = {
    id: 'rule-1',
    name: 'Rule',
    version: '1.0.0',
    description: 'Test.',
    issueCode: 'FIXTURE_RULE',
    category: 'OTHER' as const,
    severity: 'INFO' as const,
    supportedScopes: ['FULL_CATALOG' as const],
    affectedFields: ['title'],
    explanationTemplate: 'Fixture explanation.',
    recommendationTemplate: 'Review the fixture.',
    requiredKnowledgePacks: [],
    requiredCapabilityPacks: [],
    enabled: true,
    deterministic: true,
    metadata: {},
  };
  registry.register(rule);
  assert.throws(() => registry.register(rule), /already registered/);
  registry.disable('rule-1');
  assert.equal(registry.filter({}).length, 0);
  registry.enable('rule-1');
  assert.equal(registry.filter({}).length, 1);
});
