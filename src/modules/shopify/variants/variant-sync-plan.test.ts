import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  RemoteShopifyProductVariants,
} from './graphql-variant-repository.ts';
import type {
  PersistedShopifyVariantConfiguration,
} from './variant-repository.ts';
import {
  buildShopifyVariantSynchronizationPlan,
  missingShopifyOptions,
} from './variant-sync-plan.ts';

function local(
  overrides: Partial<PersistedShopifyVariantConfiguration['variants'][number]> = {},
): PersistedShopifyVariantConfiguration {
  return {
    id: 'config',
    version: 1,
    options: [{ name: 'Size', values: ['Small', 'Large'] }],
    variants: [{
      id: 'local-small',
      shopifyVariantId: null,
      combinationKey: 'size=small',
      optionValues: [{ name: 'Size', value: 'Small' }],
      price: '19.99',
      compareAtPrice: null,
      sku: 'SMALL',
      barcode: null,
      position: 0,
      active: true,
      firstPublishedAt: null,
      lastPublishedAt: null,
      ...overrides,
    }],
  };
}

function remote(
  variants: RemoteShopifyProductVariants['variants'] = [],
): RemoteShopifyProductVariants {
  return {
    hasOnlyDefaultVariant: false,
    options: [{ name: 'Size', position: 1, values: ['Small', 'Large'] }],
    variants,
    currencyCode: 'USD',
    maxProductOptions: 3,
    maxProductVariants: 2_048,
  };
}

const remoteSmall = {
  id: '9001',
  optionValues: [{ name: 'Size', value: 'Small' }],
  price: '19.99',
  compareAtPrice: null,
  sku: 'SMALL',
  barcode: null,
};

test('plans creation for an unlinked local combination', () => {
  const plan = buildShopifyVariantSynchronizationPlan(local(), remote());
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 0);
});

test('plans update and unchanged variants from persisted IDs', () => {
  const configuration = local({ shopifyVariantId: '9001' });
  assert.equal(
    buildShopifyVariantSynchronizationPlan(
      configuration,
      remote([remoteSmall]),
    ).unchanged.length,
    1,
  );
  configuration.variants[0].price = '20.00';
  assert.equal(
    buildShopifyVariantSynchronizationPlan(
      configuration,
      remote([remoteSmall]),
    ).update.length,
    1,
  );
});

test('persisted IDs are authoritative and are never matched solely by SKU', () => {
  const configuration = local({ shopifyVariantId: '9999' });
  const plan = buildShopifyVariantSynchronizationPlan(
    configuration,
    remote([remoteSmall]),
  );
  assert.equal(plan.missingRemotely.length, 1);
  assert.equal(plan.create.length, 0);
  assert.equal(plan.missingLocally.length, 1);
});

test('reconciles one unlinked exact option combination after partial persistence', () => {
  const plan = buildShopifyVariantSynchronizationPlan(
    local(),
    remote([remoteSmall]),
  );
  assert.deepEqual(plan.recoveredLinks, [{
    localVariantId: 'local-small',
    shopifyVariantId: '9001',
  }]);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.create.length, 0);
});

test('unknown and locally removed remote variants are preserved', () => {
  const configuration = local({ shopifyVariantId: '9001' });
  configuration.variants.push({
    ...configuration.variants[0],
    id: 'local-old',
    shopifyVariantId: '9002',
    combinationKey: 'size=large',
    optionValues: [{ name: 'Size', value: 'Large' }],
    active: false,
  });
  const plan = buildShopifyVariantSynchronizationPlan(configuration, remote([
    remoteSmall,
    { ...remoteSmall, id: '9002', optionValues: [{ name: 'Size', value: 'Large' }] },
    { ...remoteSmall, id: '9999', optionValues: [{ name: 'Size', value: 'Other' }] },
  ]));
  assert.deepEqual(
    plan.missingLocally.map(({ remote: item, managed }) => [item.id, managed]),
    [['9002', true], ['9999', false]],
  );
});

test('uses the existing default variant for single-variant pricing', () => {
  const configuration = local({
    combinationKey: '__default__',
    optionValues: [],
  });
  configuration.options = [];
  const defaultRemote = {
    ...remoteSmall,
    id: '7001',
    optionValues: [{ name: 'Title', value: 'Default Title' }],
  };
  const plan = buildShopifyVariantSynchronizationPlan(configuration, {
    ...remote([defaultRemote]),
    hasOnlyDefaultVariant: true,
  });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.recoveredLinks[0].shopifyVariantId, '7001');
});

test('selects only missing options and ignores Shopify default Title', () => {
  assert.deepEqual(
    missingShopifyOptions(local().options, {
      ...remote(),
      hasOnlyDefaultVariant: true,
      options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    }),
    [{ name: 'Size', values: ['Small', 'Large'] }],
  );
});
