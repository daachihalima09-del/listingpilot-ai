import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPIFY_METAFIELD_CATALOG,
  SHOPIFY_METAFIELD_CATALOG_VERSION,
  getMetafieldCatalogDefinition,
} from './metafield-catalog.ts';
import {
  deterministicJson,
  metafieldConfigurationInputSchema,
  normalizeMetafieldValue,
  shopifyMetafieldKeySchema,
  shopifyMetafieldNamespaceSchema,
} from './metafield-validation.ts';

test('catalog has unique namespace/key identities and a stable version', () => {
  const identities = SHOPIFY_METAFIELD_CATALOG.map(
    ({ namespace, key }) => `${namespace}.${key}`,
  );
  assert.equal(new Set(identities).size, identities.length);
  assert.equal(SHOPIFY_METAFIELD_CATALOG_VERSION, '1');
  assert.ok(SHOPIFY_METAFIELD_CATALOG.every(
    ({ schemaVersion }) => schemaVersion === '1',
  ));
});

test('catalog contains no sensitive source, credential, prompt, or reasoning fields', () => {
  const catalog = JSON.stringify(SHOPIFY_METAFIELD_CATALOG).toLowerCase();
  for (const sensitive of [
    'access_token',
    'encrypted',
    'credential',
    'evidence_url',
    'raw_prompt',
    'reasoning',
    'database_url',
    'user_email',
  ]) assert.equal(catalog.includes(sensitive), false);
});

test('unknown identifiers and browser identity injection are rejected', () => {
  const fields = SHOPIFY_METAFIELD_CATALOG.map(({ catalogId }) => ({
    catalogId,
    enabled: true,
  }));
  fields[0] = {
    catalogId: 'attacker.injected',
    enabled: true,
  };
  assert.equal(metafieldConfigurationInputSchema.safeParse({
    version: 0,
    fields,
    namespace: 'attacker',
    shopifyMetafieldId: '123',
  }).success, false);
  assert.equal(getMetafieldCatalogDefinition('attacker.injected'), undefined);
});

test('namespace and key validation follows Shopify safe formats', () => {
  assert.equal(shopifyMetafieldNamespaceSchema.parse('listingpilot_specs'), 'listingpilot_specs');
  assert.equal(shopifyMetafieldKeySchema.parse('id'), 'id');
  assert.equal(shopifyMetafieldNamespaceSchema.safeParse('bad.namespace').success, false);
  assert.equal(shopifyMetafieldKeySchema.safeParse('bad key').success, false);
});

test('single-line and multi-line values validate safely', () => {
  assert.equal(normalizeMetafieldValue({
    type: 'single_line_text_field',
  }, 'Model 100'), 'Model 100');
  assert.throws(() => normalizeMetafieldValue({
    type: 'single_line_text_field',
  }, 'bad\nline'));
  assert.equal(normalizeMetafieldValue({
    type: 'multi_line_text_field',
  }, 'Line one\nLine two'), 'Line one\nLine two');
  assert.throws(() => normalizeMetafieldValue({
    type: 'multi_line_text_field',
  }, `bad${String.fromCharCode(0)}value`));
});

test('list values validate and deduplicate case-insensitively', () => {
  assert.equal(normalizeMetafieldValue({
    type: 'list.single_line_text_field',
  }, ['QLED', 'qled', 'HDR']), '["QLED","HDR"]');
  assert.throws(() => normalizeMetafieldValue({
    type: 'list.single_line_text_field',
  }, ['valid', 'bad\nline']));
});

test('decimal and integer values require safe strings', () => {
  assert.equal(normalizeMetafieldValue({
    type: 'number_decimal',
  }, '99.50'), '99.50');
  assert.throws(() => normalizeMetafieldValue({
    type: 'number_decimal',
  }, 'NaN'));
  assert.throws(() => normalizeMetafieldValue({
    type: 'number_decimal',
  }, 12.2));
  assert.equal(normalizeMetafieldValue({
    type: 'number_integer',
  }, '0'), '0');
  assert.throws(() => normalizeMetafieldValue({
    type: 'number_integer',
  }, '1.5'));
  assert.throws(() => normalizeMetafieldValue({
    type: 'number_integer',
  }, '9007199254740992'));
});

test('ISO dates and deterministic JSON validate', () => {
  assert.equal(normalizeMetafieldValue({
    type: 'date_time',
  }, '2026-07-26T12:30:00+00:00'), '2026-07-26T12:30:00.000Z');
  assert.throws(() => normalizeMetafieldValue({
    type: 'date_time',
  }, 'tomorrow'));
  assert.equal(deterministicJson({
    z: 1,
    a: { y: 2, b: 3 },
  }), '{"a":{"b":3,"y":2},"z":1}');
  assert.equal(normalizeMetafieldValue({
    type: 'json',
  }, '{"z":1,"a":2}'), '{"a":2,"z":1}');
  assert.throws(() => normalizeMetafieldValue({
    type: 'json',
  }, '{bad'));
  assert.throws(() => deterministicJson({ value: Number.POSITIVE_INFINITY }));
});

test('unsupported metafield types are rejected', () => {
  assert.throws(() => normalizeMetafieldValue({
    type: 'money' as never,
  }, '10'));
});

