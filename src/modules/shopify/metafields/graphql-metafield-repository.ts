import { z } from 'zod';
import type {
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import {
  METAFIELD_DEFINITION_CREATE_MUTATION,
  METAFIELD_DEFINITION_QUERY,
  METAFIELDS_SET_MUTATION,
  PRODUCT_METAFIELDS_QUERY,
} from './graphql-documents.ts';
import {
  ShopifyMetafieldDefinitionRaceError,
  ShopifyMetafieldError,
  normalizeShopifyMetafieldError,
} from './metafield-errors.ts';
import {
  SHOPIFY_METAFIELD_CATALOG,
  SHOPIFY_METAFIELDS_SET_BATCH_SIZE,
  type MetafieldCatalogDefinition,
} from './metafield-catalog.ts';
import {
  shopifyMetafieldKeySchema,
  shopifyMetafieldNamespaceSchema,
} from './metafield-validation.ts';
import type { RemoteMetafield } from './metafield-sync-plan.ts';

const numericId = z.string().regex(/^[1-9]\d{0,19}$/);
const productGidSchema = z.string().regex(
  /^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/,
);
const definitionGid = z.string().regex(
  /^gid:\/\/shopify\/MetafieldDefinition\/[1-9]\d{0,19}$/,
);
const metafieldGid = z.string().regex(
  /^gid:\/\/shopify\/Metafield\/[1-9]\d{0,19}$/,
);
const userError = z.object({
  field: z.array(z.string()).nullable().optional(),
  message: z.string(),
  code: z.string().nullable().optional(),
}).passthrough();
const definition = z.object({
  id: definitionGid,
  namespace: shopifyMetafieldNamespaceSchema,
  key: shopifyMetafieldKeySchema,
  ownerType: z.literal('PRODUCT'),
  type: z.object({ name: z.string().min(1) }).strict(),
}).strict();
const remoteMetafield = z.object({
  id: metafieldGid,
  legacyResourceId: numericId,
  namespace: shopifyMetafieldNamespaceSchema,
  key: shopifyMetafieldKeySchema,
  type: z.string().min(1),
  value: z.string(),
  compareDigest: z.string().min(1),
}).strict();
const topLevel = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
}).passthrough();
const definitionQueryData = z.object({
  metafieldDefinitions: z.object({ nodes: z.array(definition) }).strict(),
}).strict();
const definitionCreateData = z.object({
  metafieldDefinitionCreate: z.object({
    createdDefinition: definition.nullable(),
    userErrors: z.array(userError),
  }).strict(),
}).strict();
const productData = z.object({
  product: z.object({
    id: productGidSchema,
    metafields: z.object({ nodes: z.array(remoteMetafield) }).strict(),
  }).strict().nullable(),
}).strict();
const setData = z.object({
  metafieldsSet: z.object({
    metafields: z.array(remoteMetafield).nullable(),
    userErrors: z.array(userError),
  }).strict(),
}).strict();

export interface RemoteMetafieldDefinition {
  id: string;
  namespace: string;
  key: string;
  type: string;
}

export interface MetafieldSetInput {
  catalogId: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
  compareDigest: string | null;
}

export interface ShopifyGraphqlMetafieldRepository {
  getDefinition(
    workspaceId: string,
    definition: MetafieldCatalogDefinition,
  ): Promise<RemoteMetafieldDefinition | null>;
  createDefinition(
    workspaceId: string,
    definition: MetafieldCatalogDefinition,
  ): Promise<RemoteMetafieldDefinition>;
  getCurrent(
    workspaceId: string,
    productId: string,
  ): Promise<RemoteMetafield[]>;
  setMetafields(
    workspaceId: string,
    productId: string,
    inputs: MetafieldSetInput[],
  ): Promise<RemoteMetafield[]>;
}

type AdminRequest = (
  workspaceId: string,
  input: { method: 'POST'; path: string; body: unknown },
) => Promise<ShopifyAdminResponse>;

export function productGid(productId: string) {
  return `gid://shopify/Product/${numericId.parse(productId)}`;
}

function numericFromGid(gid: string, type: 'MetafieldDefinition') {
  const match = new RegExp(`^gid://shopify/${type}/([1-9]\\d{0,19})$`).exec(gid);
  if (!match) throw new Error('Invalid Shopify global ID.');
  return match[1];
}

function invalidResponse(cause?: unknown): never {
  throw new ShopifyMetafieldError(
    'SHOPIFY_METAFIELD_INVALID_RESPONSE',
    'Shopify returned an invalid metafield response.',
    502,
    cause ? { cause } : undefined,
  );
}

function parseData(response: ShopifyAdminResponse): unknown {
  const envelope = topLevel.safeParse(response.data);
  if (!envelope.success) return invalidResponse(envelope.error);
  if (envelope.data.errors?.length || envelope.data.data === undefined) {
    return invalidResponse();
  }
  return envelope.data.data;
}

function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  return result.success ? result.data : invalidResponse(result.error);
}

function toDefinition(
  input: z.infer<typeof definition>,
): RemoteMetafieldDefinition {
  return {
    id: numericFromGid(input.id, 'MetafieldDefinition'),
    namespace: input.namespace,
    key: input.key,
    type: input.type.name,
  };
}

function toRemote(input: z.infer<typeof remoteMetafield>): RemoteMetafield {
  return {
    id: input.legacyResourceId,
    namespace: input.namespace,
    key: input.key,
    type: input.type,
    value: input.value,
    compareDigest: input.compareDigest,
  };
}

export function createShopifyGraphqlMetafieldRepository(
  request: AdminRequest,
): ShopifyGraphqlMetafieldRepository {
  async function execute(
    workspaceId: string,
    query: string,
    variables: unknown,
  ) {
    try {
      return parseData(await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        body: { query, variables },
      }));
    } catch (error) {
      throw normalizeShopifyMetafieldError(error);
    }
  }

  return {
    async getDefinition(workspaceId, requested) {
      const data = parsed(definitionQueryData, await execute(
        workspaceId,
        METAFIELD_DEFINITION_QUERY,
        {
          namespace: requested.namespace,
          query: `key:${requested.key}`,
        },
      ));
      const found = data.metafieldDefinitions.nodes.find((item) => (
        item.namespace === requested.namespace
        && item.key === requested.key
        && item.ownerType === 'PRODUCT'
      ));
      return found ? toDefinition(found) : null;
    },

    async createDefinition(workspaceId, requested) {
      const data = parsed(definitionCreateData, await execute(
        workspaceId,
        METAFIELD_DEFINITION_CREATE_MUTATION,
        {
          definition: {
            name: requested.displayName,
            description: requested.description,
            namespace: requested.namespace,
            key: requested.key,
            ownerType: 'PRODUCT',
            type: requested.type,
          },
        },
      ));
      const payload = data.metafieldDefinitionCreate;
      if (payload.userErrors.length) {
        if (payload.userErrors.some(({ code, message }) => (
          code === 'TAKEN' || /already exists|taken/i.test(message)
        ))) throw new ShopifyMetafieldDefinitionRaceError();
        throw new ShopifyMetafieldError(
          'SHOPIFY_METAFIELD_DEFINITION_FAILED',
          'Shopify could not create a required metafield definition.',
          422,
        );
      }
      if (!payload.createdDefinition) return invalidResponse();
      return toDefinition(payload.createdDefinition);
    },

    async getCurrent(workspaceId, productId) {
      const data = parsed(productData, await execute(
        workspaceId,
        PRODUCT_METAFIELDS_QUERY,
        {
          productId: productGid(productId),
          keys: SHOPIFY_METAFIELD_CATALOG.map(
            ({ namespace, key }) => `${namespace}.${key}`,
          ),
        },
      ));
      if (!data.product) {
        throw new ShopifyMetafieldError(
          'SHOPIFY_METAFIELD_PRODUCT_NOT_FOUND',
          'The linked Shopify product was not found.',
          404,
        );
      }
      const approved = new Set(SHOPIFY_METAFIELD_CATALOG.map(
        ({ namespace, key }) => `${namespace}.${key}`,
      ));
      return data.product.metafields.nodes
        .filter(({ namespace, key }) => approved.has(`${namespace}.${key}`))
        .map(toRemote);
    },

    async setMetafields(workspaceId, productId, inputs) {
      if (inputs.length < 1 || inputs.length > SHOPIFY_METAFIELDS_SET_BATCH_SIZE) {
        throw new ShopifyMetafieldError(
          'SHOPIFY_METAFIELD_VALIDATION_FAILED',
          'The metafield batch size is invalid.',
          422,
        );
      }
      const data = parsed(setData, await execute(
        workspaceId,
        METAFIELDS_SET_MUTATION,
        {
          metafields: inputs.map((input) => ({
            ownerId: productGid(productId),
            namespace: input.namespace,
            key: input.key,
            type: input.type,
            value: input.value,
            compareDigest: input.compareDigest,
          })),
        },
      ));
      if (data.metafieldsSet.userErrors.length) {
        throw new ShopifyMetafieldError(
          'SHOPIFY_METAFIELD_VALIDATION_FAILED',
          'Shopify rejected the metafield values.',
          422,
        );
      }
      if (
        !data.metafieldsSet.metafields
        || data.metafieldsSet.metafields.length !== inputs.length
      ) return invalidResponse();
      return data.metafieldsSet.metafields.map(toRemote);
    },
  };
}
