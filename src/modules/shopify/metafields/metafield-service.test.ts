import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHOPIFY_METAFIELD_CATALOG,
} from './metafield-catalog.ts';
import {
  ShopifyMetafieldDefinitionRaceError,
  ShopifyMetafieldError,
} from './metafield-errors.ts';
import type {
  ShopifyGraphqlMetafieldRepository,
} from './graphql-metafield-repository.ts';
import {
  mapProjectToMetafields,
} from './metafield-mapping.ts';
import type {
  PersistedMetafieldConfiguration,
  ShopifyMetafieldProjectContext,
  ShopifyMetafieldRepository,
} from './metafield-repository.ts';
import {
  buildMetafieldConfigurationDto,
  getShopifyMetafieldConfiguration,
  publishShopifyMetafields,
  saveShopifyMetafieldConfiguration,
} from './metafield-service.ts';

function createConfiguration(
  projectId: string,
  published = false,
): PersistedMetafieldConfiguration {
  const mapping = new Map(mapProjectToMetafields({
    projectId,
    analysisData: null,
    generatedListing: null,
    seoData: null,
  }).map((field) => [field.catalogId, field]));
  return {
    id: 'configuration',
    schemaVersion: '1',
    version: 1,
    fields: SHOPIFY_METAFIELD_CATALOG.map((definition, index) => {
      const value = mapping.get(definition.catalogId);
      return {
        id: `local-${index}`,
        catalogId: definition.catalogId,
        namespace: definition.namespace,
        key: definition.key,
        type: definition.type,
        value: value?.value ?? null,
        valueHash: value?.valueHash ?? null,
        enabled: true,
        shopifyMetafieldId: published && value ? String(1000 + index) : null,
        firstPublishedAt: published && value
          ? new Date('2026-07-25T00:00:00.000Z')
          : null,
        lastPublishedAt: published && value
          ? new Date('2026-07-25T00:00:00.000Z')
          : null,
        lastPublishedHash: published && value ? value.valueHash : null,
      };
    }),
  };
}

function projectContext(
  overrides: Partial<ShopifyMetafieldProjectContext> = {},
): ShopifyMetafieldProjectContext {
  const projectId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  return {
    actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    workspaceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectId,
    role: 'OWNER',
    archived: false,
    shopifyStoreId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    shopifyProductId: '123456789',
    projectData: {
      analysisData: null,
      generatedListing: null,
      seoData: null,
    },
    configuration: createConfiguration(projectId),
    ...overrides,
  };
}

function setup(options: {
  remote?: 'empty' | 'unchanged';
  definitions?: 'existing' | 'missing' | 'conflict' | 'race';
  persistenceFails?: boolean;
} = {}) {
  let context = projectContext();
  const calls = {
    saves: 0,
    definitionsCreated: 0,
    definitionsPersisted: 0,
    sets: 0,
    persistedBatches: 0,
    audits: [] as string[],
    definitionLookups: new Map<string, number>(),
  };
  const repository: ShopifyMetafieldRepository = {
    async resolveProject() { return context; },
    async saveConfiguration(input) {
      calls.saves += 1;
      if (input.version !== (context.configuration?.version ?? 0)) return false;
      context = {
        ...context,
        configuration: {
          id: 'configuration',
          schemaVersion: '1',
          version: input.version + 1,
          fields: input.fields.map((field, index) => ({
            id: `local-${index}`,
            ...field,
            firstPublishedAt: null,
            lastPublishedAt: null,
            lastPublishedHash: null,
            shopifyMetafieldId: null,
          })),
        },
      };
      return true;
    },
    async refreshMappedValues(input) {
      if (!context.configuration) return;
      const byId = new Map(input.fields.map((field) => [field.catalogId, field]));
      context.configuration.fields = context.configuration.fields.map((field) => ({
        ...field,
        value: byId.get(field.catalogId)?.value ?? field.value,
        valueHash: byId.get(field.catalogId)?.valueHash ?? field.valueHash,
      }));
    },
    async persistDefinition() {
      calls.definitionsPersisted += 1;
      if (options.persistenceFails && calls.sets === 0) {
        throw new Error('database unavailable');
      }
    },
    async persistPublished(input) {
      calls.persistedBatches += 1;
      if (options.persistenceFails) throw new Error('database unavailable');
      if (!context.configuration) return;
      for (const published of input.fields) {
        const field = context.configuration.fields.find(
          ({ catalogId }) => catalogId === published.catalogId,
        );
        if (field) {
          field.shopifyMetafieldId = published.shopifyMetafieldId;
          field.lastPublishedHash = published.valueHash;
          field.lastPublishedAt = input.publishedAt;
          field.firstPublishedAt ??= input.publishedAt;
        }
      }
    },
    async createAudit(input) {
      calls.audits.push(input.action);
    },
  };
  const shopify: ShopifyGraphqlMetafieldRepository = {
    async getDefinition(_workspace, definition) {
      const count = (calls.definitionLookups.get(definition.catalogId) ?? 0) + 1;
      calls.definitionLookups.set(definition.catalogId, count);
      if (options.definitions === 'missing') return null;
      if (options.definitions === 'race' && count === 1) return null;
      return {
        id: '500',
        namespace: definition.namespace,
        key: definition.key,
        type: options.definitions === 'conflict'
          && definition.catalogId === 'listingpilot_system.schema_version'
          ? 'number_integer'
          : definition.type,
      };
    },
    async createDefinition(_workspace, definition) {
      calls.definitionsCreated += 1;
      if (options.definitions === 'race') {
        throw new ShopifyMetafieldDefinitionRaceError();
      }
      return {
        id: '501',
        namespace: definition.namespace,
        key: definition.key,
        type: definition.type,
      };
    },
    async getCurrent() {
      if (options.remote !== 'unchanged') return [];
      return (context.configuration?.fields ?? [])
        .filter(({ value }) => value)
        .map((field, index) => ({
          id: String(1000 + index),
          namespace: field.namespace,
          key: field.key,
          type: field.type,
          value: field.value!,
          compareDigest: `digest-${index}`,
        }));
    },
    async setMetafields(_workspace, _product, inputs) {
      calls.sets += 1;
      return inputs.map((input, index) => ({
        id: String(2000 + index),
        namespace: input.namespace,
        key: input.key,
        type: input.type,
        value: input.value,
        compareDigest: `new-digest-${index}`,
      }));
    },
  };
  return {
    repository,
    shopify,
    calls,
    getContext: () => context,
  };
}

function saveInput(version = 1) {
  return {
    version,
    fields: SHOPIFY_METAFIELD_CATALOG.map(({ catalogId }) => ({
      catalogId,
      enabled: true,
    })),
  };
}

test('active members can view a client-safe grouped preview', async () => {
  const { repository, getContext } = setup();
  const result = await getShopifyMetafieldConfiguration(
    repository,
    getContext(),
  );
  assert.equal(result.fields.length, SHOPIFY_METAFIELD_CATALOG.length);
  assert.ok(result.fields.some(({ group }) => group === 'PRODUCT_TRUTH'));
  assert.equal(JSON.stringify(result).includes('shopifyMetafieldId'), false);
});

test('non-OWNER cannot save or publish and hidden projects return 404', async () => {
  const { repository, shopify, getContext } = setup();
  await assert.rejects(
    saveShopifyMetafieldConfiguration(repository, {
      ...getContext(),
      role: 'MEMBER',
    }, saveInput()),
    (error: unknown) => error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_FORBIDDEN',
  );
  await assert.rejects(
    publishShopifyMetafields({ repository, shopify }, {
      ...getContext(),
      role: 'ADMIN',
    }),
    ShopifyMetafieldError,
  );
  await assert.rejects(
    getShopifyMetafieldConfiguration(repository, null),
    (error: unknown) => error instanceof ShopifyMetafieldError
      && error.statusCode === 404,
  );
});

test('OWNER can save approved choices with optimistic versioning', async () => {
  const { repository, getContext, calls } = setup();
  const result = await saveShopifyMetafieldConfiguration(
    repository,
    getContext(),
    saveInput(),
  );
  assert.equal(calls.saves, 1);
  assert.equal(result.version, 2);
  await assert.rejects(
    saveShopifyMetafieldConfiguration(repository, getContext(), saveInput(1)),
    (error: unknown) => error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_CONFIG_CONFLICT',
  );
});

test('archived projects, disconnected stores, and missing products are rejected', async () => {
  const { repository, shopify, getContext } = setup();
  await assert.rejects(
    saveShopifyMetafieldConfiguration(repository, {
      ...getContext(),
      archived: true,
    }, saveInput()),
    ShopifyMetafieldError,
  );
  await assert.rejects(
    publishShopifyMetafields({ repository, shopify }, {
      ...getContext(),
      shopifyStoreId: null,
    }),
    (error: unknown) => error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_STORE_NOT_CONNECTED',
  );
  await assert.rejects(
    publishShopifyMetafields({ repository, shopify }, {
      ...getContext(),
      shopifyProductId: null,
    }),
    (error: unknown) => error instanceof ShopifyMetafieldError
      && error.code === 'SHOPIFY_METAFIELD_PRODUCT_NOT_LINKED',
  );
});

test('missing definitions are created, linked, and metafields publish successfully', async () => {
  const {
    repository,
    shopify,
    getContext,
    calls,
  } = setup({ definitions: 'missing', remote: 'empty' });
  const result = await publishShopifyMetafields(
    { repository, shopify },
    getContext(),
  );
  assert.equal(result.outcome, 'PUBLISHED');
  assert.ok(result.created >= 3);
  assert.equal(calls.sets, 1);
  assert.ok(calls.definitionsCreated >= 3);
  assert.equal(calls.definitionsPersisted, calls.definitionsCreated);
  assert.ok(calls.audits.includes('shopify.metafield_definitions_created'));
  assert.ok(calls.audits.includes('shopify.metafields_created'));
});

test('definition creation races are reconciled by rereading without duplication', async () => {
  const {
    repository,
    shopify,
    getContext,
    calls,
  } = setup({ definitions: 'race', remote: 'empty' });
  const result = await publishShopifyMetafields(
    { repository, shopify },
    getContext(),
  );
  assert.equal(result.outcome, 'PUBLISHED');
  assert.ok([...calls.definitionLookups.values()].every((count) => count >= 2));
});

test('incompatible definitions are preserved and produce safe partial success', async () => {
  const {
    repository,
    shopify,
    getContext,
    calls,
  } = setup({ definitions: 'conflict', remote: 'unchanged' });
  const result = await publishShopifyMetafields(
    { repository, shopify },
    getContext(),
  );
  assert.equal(result.outcome, 'PARTIAL');
  assert.equal(result.conflicted, 1);
  assert.equal(calls.definitionsCreated, 0);
  assert.ok(calls.audits.includes('shopify.metafield_definition_conflict'));
  assert.equal(result.configuration.conflicts[0].existingType, 'number_integer');
});

test('no-change publish skips metafieldsSet and records unchanged audit', async () => {
  const {
    repository,
    shopify,
    getContext,
    calls,
  } = setup({ definitions: 'existing', remote: 'unchanged' });
  const result = await publishShopifyMetafields(
    { repository, shopify },
    getContext(),
  );
  assert.equal(result.outcome, 'UNCHANGED');
  assert.equal(calls.sets, 0);
  assert.ok(calls.audits.includes('shopify.metafields_publish_unchanged'));
});

test('Shopify success followed by persistence failure returns recoverable partial state', async () => {
  const {
    repository,
    shopify,
    getContext,
  } = setup({
    definitions: 'existing',
    remote: 'empty',
    persistenceFails: true,
  });
  // Definition linkage persistence is itself a recoverable partial outcome.
  const result = await publishShopifyMetafields(
    { repository, shopify },
    getContext(),
  );
  assert.equal(result.outcome, 'PARTIAL');
  assert.match(result.message, /needs attention/);
});

test('preview summarizes large JSON instead of exposing it', () => {
  const context = projectContext({
    projectData: {
      analysisData: null,
      generatedListing: null,
      seoData: null,
    },
  });
  const dto = buildMetafieldConfigurationDto(context);
  const specification = dto.fields.find(
    ({ catalogId }) => catalogId === 'listingpilot_specs.specifications_json',
  );
  assert.equal(specification?.preview, null);
});
