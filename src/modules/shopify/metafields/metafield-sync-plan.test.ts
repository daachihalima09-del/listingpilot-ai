import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetafieldSynchronizationPlan,
  deterministicMetafieldBatches,
  type LocalMetafield,
} from './metafield-sync-plan.ts';
import { metafieldValueHash } from './metafield-mapping.ts';

function local(overrides: Partial<LocalMetafield> = {}): LocalMetafield {
  return {
    localId: 'local',
    catalogId: 'listingpilot_specs.model_number',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    type: 'single_line_text_field',
    value: 'Q80D',
    valueHash: metafieldValueHash('Q80D'),
    enabled: true,
    shopifyMetafieldId: null,
    ...overrides,
  };
}

function remote(value = 'Q80D') {
  return {
    id: '100',
    namespace: 'listingpilot_specs',
    key: 'model_number',
    type: 'single_line_text_field',
    value,
    compareDigest: 'digest',
  };
}

test('classifies create, update, and unchanged fields', () => {
  assert.equal(buildMetafieldSynchronizationPlan([local()], []).create.length, 1);
  assert.equal(buildMetafieldSynchronizationPlan(
    [local()],
    [remote('Old')],
  ).update.length, 1);
  assert.equal(buildMetafieldSynchronizationPlan(
    [local()],
    [remote()],
  ).unchanged.length, 1);
});

test('skips disabled and empty omitted values without deleting remote data', () => {
  assert.equal(buildMetafieldSynchronizationPlan(
    [local({ enabled: false })],
    [remote()],
  ).disabled.length, 1);
  assert.equal(buildMetafieldSynchronizationPlan(
    [local({ value: null, valueHash: null })],
    [remote()],
  ).emptyOmitted.length, 1);
});

test('classifies definition conflicts and missing remote linkage', () => {
  const field = local({ shopifyMetafieldId: '100' });
  const missing = buildMetafieldSynchronizationPlan([field], []);
  assert.equal(missing.missingRemotely.length, 1);
  assert.equal(missing.create.length, 1);
  const conflict = buildMetafieldSynchronizationPlan([field], [], [{
    catalogId: field.catalogId,
    expectedType: field.type,
    existingType: 'number_integer',
  }]);
  assert.equal(conflict.definitionConflicts.length, 1);
  assert.equal(conflict.create.length, 0);
});

test('detects invalid remote type linkage', () => {
  const invalid = buildMetafieldSynchronizationPlan([local()], [{
    ...remote(),
    type: 'number_integer',
  }]);
  assert.equal(invalid.invalidLocal.length, 1);
});

test('batches deterministically and respects the Shopify 25-item limit', () => {
  const items = Array.from({ length: 57 }, (_, index) => ({
    catalogId: `field.${String(56 - index).padStart(2, '0')}`,
  }));
  const batches = deterministicMetafieldBatches(items);
  assert.deepEqual(batches.map(({ length }) => length), [25, 25, 7]);
  assert.ok(batches.every(({ length }) => length <= 25));
  assert.equal(batches[0][0].catalogId, 'field.00');
  assert.throws(() => deterministicMetafieldBatches(items, 0));
});

