import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG_PREFERENCE_SCHEMA_VERSION,
  catalogPreferenceSectionDefinition,
} from './catalog-section.ts';
import { createMerchantPreferenceRegistry } from './default-registry.ts';
import { MerchantPreferenceError } from './errors.ts';
import { MerchantPreferenceRegistry } from './registry.ts';
import { catalogPreferenceFixture } from './test-fixtures.ts';

test('registers the Catalog validator, defaults, completion and migration contract', () => {
  const definition = createMerchantPreferenceRegistry().get('catalog');
  assert.equal(definition.currentSchemaVersion, CATALOG_PREFERENCE_SCHEMA_VERSION);
  assert.equal(definition.validator.safeParse(catalogPreferenceFixture()).success, true);
  assert.deepEqual(definition.defaultProvider(), {
    setupMode: 'MANUAL',
    collections: [],
    productTypes: [],
    vendors: [],
  });
  assert.equal(
    definition.completionEvaluator(catalogPreferenceFixture()).complete,
    true,
  );
  assert.deepEqual(
    definition.migrate(catalogPreferenceFixture(), 1),
    { schemaVersion: 1, data: catalogPreferenceFixture() },
  );
});

test('rejects duplicate section registrations', () => {
  const registry = new MerchantPreferenceRegistry()
    .register(catalogPreferenceSectionDefinition);
  assert.throws(
    () => registry.register(catalogPreferenceSectionDefinition),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'UNSUPPORTED_SECTION'
    ),
  );
});

test('Listing is active while future reserved sections have no active definition', () => {
  const registry = createMerchantPreferenceRegistry();
  assert.equal(registry.has('listing'), true);
  assert.deepEqual(registry.activeSectionIds(), ['catalog', 'listing']);
  assert.throws(
    () => registry.get('seo'),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'UNSUPPORTED_SECTION'
    ),
  );
});

test('Catalog serialization and deserialization preserve detailed validation', () => {
  const definition = createMerchantPreferenceRegistry().get('catalog');
  const data = catalogPreferenceFixture();
  assert.deepEqual(definition.deserialize(definition.serialize(data)), data);
  assert.throws(() => definition.deserialize({
    ...data,
    vendors: ['Northwind', ' northwind '],
  }));
});

test('unsupported Catalog schema migrations fail safely', () => {
  assert.throws(
    () => catalogPreferenceSectionDefinition.migrate(
      catalogPreferenceFixture(),
      2,
    ),
    (error: unknown) => (
      error instanceof MerchantPreferenceError
      && error.code === 'UNSUPPORTED_SECTION_VERSION'
    ),
  );
});
