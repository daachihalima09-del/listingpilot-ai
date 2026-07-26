import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  RemoteShopifyProductVariants,
  ShopifyGraphqlVariantRepository,
} from './graphql-variant-repository.ts';
import {
  ShopifyVariantError,
} from './variant-errors.ts';
import type {
  PersistedShopifyVariantConfiguration,
  ShopifyVariantProjectContext,
  ShopifyVariantRepository,
} from './variant-repository.ts';
import {
  getShopifyVariantConfiguration,
  publishShopifyVariants,
  saveShopifyVariantConfiguration,
} from './variant-service.ts';

function configuration(): PersistedShopifyVariantConfiguration {
  return {
    id: 'configuration',
    version: 1,
    options: [{ name: 'Size', values: ['Small', 'Large'] }],
    variants: [
      {
        id: 'local-small',
        shopifyVariantId: '9001',
        combinationKey: 'size=small',
        optionValues: [{ name: 'Size', value: 'Small' }],
        price: '20.00',
        compareAtPrice: null,
        sku: 'SMALL',
        barcode: null,
        position: 0,
        active: true,
        firstPublishedAt: new Date('2026-07-25T00:00:00.000Z'),
        lastPublishedAt: new Date('2026-07-25T00:00:00.000Z'),
      },
      {
        id: 'local-large',
        shopifyVariantId: null,
        combinationKey: 'size=large',
        optionValues: [{ name: 'Size', value: 'Large' }],
        price: '22.00',
        compareAtPrice: '25.00',
        sku: 'LARGE',
        barcode: null,
        position: 1,
        active: true,
        firstPublishedAt: null,
        lastPublishedAt: null,
      },
    ],
  };
}

function context(
  overrides: Partial<ShopifyVariantProjectContext> = {},
): ShopifyVariantProjectContext {
  return {
    actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workspaceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    role: 'OWNER',
    archived: false,
    shopifyProductId: '123456789',
    configuration: configuration(),
    ...overrides,
  };
}

function dto(configurationVersion = 1) {
  return {
    version: configurationVersion,
    options: [{ name: 'Size', values: ['Small', 'Large'] }],
    variants: [{
      optionValues: [{ name: 'Size', value: 'Small' }],
      price: '20.00',
      compareAtPrice: null,
      sku: 'SMALL',
      barcode: null,
      published: true,
      firstPublishedAt: '2026-07-25T00:00:00.000Z',
      lastPublishedAt: '2026-07-26T00:00:00.000Z',
    }],
  };
}

function remote(
  variants: RemoteShopifyProductVariants['variants'] = [{
    id: '9001',
    optionValues: [{ name: 'Size', value: 'Small' }],
    price: '19.00',
    compareAtPrice: null,
    sku: 'SMALL',
    barcode: null,
  }],
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

function setup(options: {
  createFails?: boolean;
  linkFails?: boolean;
  remoteVariants?: RemoteShopifyProductVariants['variants'];
} = {}) {
  const calls = {
    create: 0,
    update: 0,
    links: [] as string[],
    audits: [] as string[],
    saves: 0,
  };
  const repository: ShopifyVariantRepository = {
    async resolveProject() { return context(); },
    async getDto() { return dto(); },
    async saveConfiguration() {
      calls.saves += 1;
      return dto(2);
    },
    async linkVariant(input) {
      if (options.linkFails) throw new Error('db failed');
      calls.links.push(input.localVariantId);
    },
    async touchVariants() {},
    async createAudit(input) {
      calls.audits.push(input.action);
    },
  };
  const shopify: ShopifyGraphqlVariantRepository = {
    async getCurrent() {
      return remote(options.remoteVariants);
    },
    async createOptions() {},
    async createVariants(_workspace, _product, variants) {
      calls.create += 1;
      if (options.createFails) throw new Error('mutation failed');
      return variants.map((input, index) => ({
        localVariantId: input.localVariantId,
        variant: {
          id: String(9100 + index),
          optionValues: input.optionValues ?? [],
          price: input.price,
          compareAtPrice: input.compareAtPrice,
          sku: input.sku,
          barcode: input.barcode,
        },
      }));
    },
    async updateVariants(_workspace, _product, variants) {
      calls.update += 1;
      return variants.map((input) => ({
        localVariantId: input.localVariantId,
        variant: {
          id: input.shopifyVariantId ?? '9001',
          optionValues: input.optionValues ?? [],
          price: input.price,
          compareAtPrice: input.compareAtPrice,
          sku: input.sku,
          barcode: input.barcode,
        },
      }));
    },
  };
  return { repository, shopify, calls };
}

test('active project members can view a client-safe configuration', async () => {
  const { repository } = setup();
  assert.equal(
    (await getShopifyVariantConfiguration(
      repository,
      context({ role: 'VIEWER' }),
    )).version,
    1,
  );
});

test('OWNER can save a validated configuration', async () => {
  const { repository, calls } = setup();
  const saved = await saveShopifyVariantConfiguration(
    repository,
    context(),
    {
      version: 1,
      options: [],
      variants: [{
        optionValues: [],
        price: '10.00',
        compareAtPrice: null,
        sku: null,
        barcode: null,
      }],
    },
  );
  assert.equal(saved.version, 2);
  assert.equal(calls.saves, 1);
});

test('read-only, cross-workspace, and archived mutations are rejected', async () => {
  const { repository } = setup();
  await assert.rejects(
    saveShopifyVariantConfiguration(repository, context({ role: 'MEMBER' }), {}),
    (error) => error instanceof ShopifyVariantError
      && error.code === 'SHOPIFY_VARIANT_FORBIDDEN',
  );
  await assert.rejects(
    saveShopifyVariantConfiguration(repository, null, {}),
    (error) => error instanceof ShopifyVariantError
      && error.code === 'SHOPIFY_VARIANT_PROJECT_NOT_FOUND',
  );
  await assert.rejects(
    saveShopifyVariantConfiguration(repository, context({ archived: true }), {}),
    (error) => error instanceof ShopifyVariantError
      && error.code === 'SHOPIFY_VARIANT_PROJECT_ARCHIVED',
  );
});

test('publishing requires a linked Shopify product', async () => {
  const dependencies = setup();
  await assert.rejects(
    publishShopifyVariants(
      dependencies,
      context({ shopifyProductId: null }),
    ),
    (error) => error instanceof ShopifyVariantError
      && error.code === 'SHOPIFY_VARIANT_PRODUCT_NOT_LINKED',
  );
});

test('mixed workflow updates and creates, persists linkage, and audits', async () => {
  const dependencies = setup();
  const result = await publishShopifyVariants(dependencies, context());
  assert.equal(result.outcome, 'PUBLISHED');
  assert.equal(result.updated, 1);
  assert.equal(result.created, 1);
  assert.deepEqual(dependencies.calls.links, ['local-large']);
  assert.deepEqual(dependencies.calls.audits, [
    'shopify.variants_updated',
    'shopify.variants_created',
  ]);
});

test('no-change publish skips unsafe mutations', async () => {
  const dependencies = setup({
    remoteVariants: [
      {
        id: '9001',
        optionValues: [{ name: 'Size', value: 'Small' }],
        price: '20.00',
        compareAtPrice: null,
        sku: 'SMALL',
        barcode: null,
      },
      {
        id: '9002',
        optionValues: [{ name: 'Size', value: 'Large' }],
        price: '22.00',
        compareAtPrice: '25.00',
        sku: 'LARGE',
        barcode: null,
      },
    ],
  });
  const project = context();
  project.configuration!.variants[1].shopifyVariantId = '9002';
  const result = await publishShopifyVariants(dependencies, project);
  assert.equal(result.outcome, 'UNCHANGED');
  assert.equal(dependencies.calls.create, 0);
  assert.equal(dependencies.calls.update, 0);
});

test('a later mutation failure reports honest partial success', async () => {
  const dependencies = setup({ createFails: true });
  const result = await publishShopifyVariants(dependencies, context());
  assert.equal(result.outcome, 'PARTIAL');
  assert.equal(result.updated, 1);
  assert.ok(
    dependencies.calls.audits.includes('shopify.variant_publish_partial'),
  );
});

test('creation linkage persistence failure is recoverable by combination', async () => {
  const first = setup({ linkFails: true });
  const firstResult = await publishShopifyVariants(first, context());
  assert.equal(firstResult.outcome, 'PARTIAL');
  assert.equal(first.calls.create, 1);

  const recoveryRemote = [
    {
      id: '9001',
      optionValues: [{ name: 'Size', value: 'Small' }],
      price: '20.00',
      compareAtPrice: null,
      sku: 'SMALL',
      barcode: null,
    },
    {
      id: '9100',
      optionValues: [{ name: 'Size', value: 'Large' }],
      price: '22.00',
      compareAtPrice: '25.00',
      sku: 'LARGE',
      barcode: null,
    },
  ];
  const recovery = setup({ remoteVariants: recoveryRemote });
  const recovered = await publishShopifyVariants(recovery, context());
  assert.notEqual(recovered.outcome, 'PARTIAL');
  assert.equal(recovery.calls.create, 0);
  assert.deepEqual(recovery.calls.links, ['local-large']);
});
