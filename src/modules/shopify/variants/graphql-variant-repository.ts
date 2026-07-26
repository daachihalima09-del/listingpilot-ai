import { z } from 'zod';
import type {
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import {
  ShopifyVariantError,
  normalizeShopifyVariantError,
} from './variant-errors.ts';
import {
  CURRENT_PRODUCT_VARIANTS_QUERY,
  PRODUCT_OPTIONS_CREATE_MUTATION,
  PRODUCT_VARIANTS_BULK_CREATE_MUTATION,
  PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
} from './graphql-documents.ts';

const numericId = z.string().regex(/^[1-9]\d{0,19}$/);
const productGid = z.string().regex(/^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/);
const variantGid = z.string().regex(
  /^gid:\/\/shopify\/ProductVariant\/[1-9]\d{0,19}$/,
);
const money = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);
const option = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  position: z.number().int().positive(),
  values: z.array(z.string()),
}).strict();
const variant = z.object({
  id: variantGid,
  price: money,
  compareAtPrice: money.nullable(),
  barcode: z.string().nullable(),
  selectedOptions: z.array(z.object({
    name: z.string(),
    value: z.string(),
  }).strict()).max(3),
  inventoryItem: z.object({
    sku: z.string().nullable(),
  }).strict(),
}).strict();
const pageInfo = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
}).strict();
const userError = z.object({
  field: z.array(z.string()).nullable().optional(),
  message: z.string(),
  code: z.string().nullable().optional(),
}).passthrough();

const topLevelSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({
    message: z.string(),
  }).passthrough()).optional(),
}).passthrough();

const currentPageSchema = z.object({
  shop: z.object({
    currencyCode: z.string().min(3).max(3),
    resourceLimits: z.object({
      maxProductOptions: z.number().int().positive(),
      maxProductVariants: z.number().int().positive(),
    }).strict(),
  }).strict(),
  product: z.object({
    id: productGid,
    hasOnlyDefaultVariant: z.boolean(),
    options: z.array(option),
    variants: z.object({
      nodes: z.array(variant),
      pageInfo,
    }).strict(),
  }).strict().nullable(),
}).strict();

const optionsCreateSchema = z.object({
  productOptionsCreate: z.object({
    product: z.object({
      id: productGid,
      options: z.array(option),
    }).strict().nullable(),
    userErrors: z.array(userError),
  }).strict(),
}).strict();

function bulkMutationSchema(field: string) {
  return z.object({
    [field]: z.object({
      productVariants: z.array(variant).nullable(),
      userErrors: z.array(userError),
    }).strict(),
  }).strict();
}

export interface RemoteShopifyVariant {
  id: string;
  optionValues: Array<{ name: string; value: string }>;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
}

export interface RemoteShopifyProductVariants {
  hasOnlyDefaultVariant: boolean;
  options: Array<{ name: string; position: number; values: string[] }>;
  variants: RemoteShopifyVariant[];
  currencyCode: string;
  maxProductOptions: number;
  maxProductVariants: number;
}

export interface ShopifyVariantMutationInput {
  localVariantId: string;
  optionValues?: Array<{ name: string; value: string }>;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
  shopifyVariantId?: string;
}

export interface ShopifyGraphqlVariantRepository {
  getCurrent(
    workspaceId: string,
    productId: string,
  ): Promise<RemoteShopifyProductVariants>;
  createOptions(
    workspaceId: string,
    productId: string,
    options: Array<{ name: string; values: string[] }>,
  ): Promise<void>;
  createVariants(
    workspaceId: string,
    productId: string,
    variants: ShopifyVariantMutationInput[],
  ): Promise<Array<{
    localVariantId: string;
    variant: RemoteShopifyVariant;
  }>>;
  updateVariants(
    workspaceId: string,
    productId: string,
    variants: ShopifyVariantMutationInput[],
  ): Promise<Array<{
    localVariantId: string;
    variant: RemoteShopifyVariant;
  }>>;
}

type AdminRequest = (
  workspaceId: string,
  input: {
    method: 'POST';
    path: string;
    body: unknown;
  },
) => Promise<ShopifyAdminResponse>;

export function shopifyProductGid(productId: string): string {
  return `gid://shopify/Product/${numericId.parse(productId)}`;
}

export function shopifyVariantGid(variantId: string): string {
  return `gid://shopify/ProductVariant/${numericId.parse(variantId)}`;
}

export function numericIdFromGid(gid: string, type: 'Product' | 'ProductVariant') {
  const match = new RegExp(`^gid://shopify/${type}/([1-9]\\d{0,19})$`).exec(gid);
  if (!match) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_INVALID_RESPONSE',
      'Shopify returned an invalid variant response.',
      502,
    );
  }
  return match[1];
}

function parseGraphqlData(response: ShopifyAdminResponse): unknown {
  const parsed = topLevelSchema.safeParse(response.data);
  if (!parsed.success) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_INVALID_RESPONSE',
      'Shopify returned an invalid GraphQL response.',
      502,
    );
  }
  if (parsed.data.errors?.length) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_UNAVAILABLE',
      'Shopify could not complete the variant operation.',
      502,
    );
  }
  if (parsed.data.data === undefined) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_INVALID_RESPONSE',
      'Shopify returned an invalid GraphQL response.',
      502,
    );
  }
  return parsed.data.data;
}

function assertNoUserErrors(errors: Array<z.infer<typeof userError>>) {
  if (!errors.length) return;
  const notFound = errors.some(({ code }) => (
    code === 'PRODUCT_DOES_NOT_EXIST'
    || code === 'PRODUCT_VARIANT_DOES_NOT_EXIST'
  ));
  throw new ShopifyVariantError(
    notFound ? 'SHOPIFY_VARIANT_NOT_FOUND' : 'SHOPIFY_VARIANT_VALIDATION_FAILED',
    notFound
      ? 'The linked Shopify product or variant was not found.'
      : 'Shopify rejected the variant configuration.',
    notFound ? 404 : 422,
  );
}

function parseShopifyResponse<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_INVALID_RESPONSE',
      'Shopify returned an invalid variant response.',
      502,
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

function toRemoteVariant(input: z.infer<typeof variant>): RemoteShopifyVariant {
  return {
    id: numericIdFromGid(input.id, 'ProductVariant'),
    optionValues: input.selectedOptions,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    sku: input.inventoryItem.sku || null,
    barcode: input.barcode || null,
  };
}

function mutationVariables(input: ShopifyVariantMutationInput, update: boolean) {
  return {
    ...(update
      ? { id: shopifyVariantGid(numericId.parse(input.shopifyVariantId)) }
      : {}),
    ...(input.optionValues
      ? {
          optionValues: input.optionValues.map(({ name, value }) => ({
            optionName: name,
            name: value,
          })),
        }
      : {}),
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    barcode: input.barcode ?? '',
    inventoryItem: { sku: input.sku ?? '' },
  };
}

export function createShopifyGraphqlVariantRepository(
  request: AdminRequest,
): ShopifyGraphqlVariantRepository {
  async function execute(
    workspaceId: string,
    query: string,
    variables: unknown,
  ) {
    try {
      return parseGraphqlData(await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        body: { query, variables },
      }));
    } catch (error) {
      throw normalizeShopifyVariantError(error);
    }
  }

  async function mutateVariants(
    workspaceId: string,
    productId: string,
    inputs: ShopifyVariantMutationInput[],
    mode: 'create' | 'update',
  ) {
    if (inputs.length === 0) return [];
    const field = mode === 'create'
      ? 'productVariantsBulkCreate'
      : 'productVariantsBulkUpdate';
    const data = parseShopifyResponse(bulkMutationSchema(field), await execute(
      workspaceId,
      mode === 'create'
        ? PRODUCT_VARIANTS_BULK_CREATE_MUTATION
        : PRODUCT_VARIANTS_BULK_UPDATE_MUTATION,
      {
        productId: shopifyProductGid(productId),
        variants: inputs.map((input) => mutationVariables(
          input,
          mode === 'update',
        )),
      },
    ));
    const payload = data[field];
    assertNoUserErrors(payload.userErrors);
    if (!payload.productVariants || payload.productVariants.length !== inputs.length) {
      throw new ShopifyVariantError(
        'SHOPIFY_VARIANT_INVALID_RESPONSE',
        'Shopify returned an invalid variant response.',
        502,
      );
    }
    return payload.productVariants.map((remote, index) => ({
      localVariantId: inputs[index].localVariantId,
      variant: toRemoteVariant(remote),
    }));
  }

  return {
    async getCurrent(workspaceId, productId) {
      let after: string | null = null;
      let firstPage: z.infer<typeof currentPageSchema> | null = null;
      const variants: RemoteShopifyVariant[] = [];
      do {
        const page: z.infer<typeof currentPageSchema> = parseShopifyResponse(
          currentPageSchema,
          await execute(
          workspaceId,
          CURRENT_PRODUCT_VARIANTS_QUERY,
          {
            productId: shopifyProductGid(productId),
            after,
          },
        ));
        if (!page.product) {
          throw new ShopifyVariantError(
            'SHOPIFY_VARIANT_NOT_FOUND',
            'The linked Shopify product was not found.',
            404,
          );
        }
        firstPage ??= page;
        variants.push(...page.product.variants.nodes.map(toRemoteVariant));
        after = page.product.variants.pageInfo.hasNextPage
          ? page.product.variants.pageInfo.endCursor
          : null;
        if (page.product.variants.pageInfo.hasNextPage && !after) {
          throw new ShopifyVariantError(
            'SHOPIFY_VARIANT_INVALID_RESPONSE',
            'Shopify returned invalid variant pagination.',
            502,
          );
        }
      } while (after);

      if (!firstPage?.product) {
        throw new ShopifyVariantError(
          'SHOPIFY_VARIANT_INVALID_RESPONSE',
          'Shopify returned an invalid variant response.',
          502,
        );
      }
      return {
        hasOnlyDefaultVariant: firstPage.product.hasOnlyDefaultVariant,
        options: firstPage.product.options.map(({ name, position, values }) => ({
          name,
          position,
          values,
        })),
        variants,
        currencyCode: firstPage.shop.currencyCode,
        maxProductOptions: firstPage.shop.resourceLimits.maxProductOptions,
        maxProductVariants: firstPage.shop.resourceLimits.maxProductVariants,
      };
    },

    async createOptions(workspaceId, productId, options) {
      if (options.length === 0) return;
      const data = parseShopifyResponse(optionsCreateSchema, await execute(
        workspaceId,
        PRODUCT_OPTIONS_CREATE_MUTATION,
        {
          productId: shopifyProductGid(productId),
          options: options.map((option) => ({
            name: option.name,
            values: option.values.map((name) => ({ name })),
          })),
        },
      ));
      assertNoUserErrors(data.productOptionsCreate.userErrors);
      if (!data.productOptionsCreate.product) {
        throw new ShopifyVariantError(
          'SHOPIFY_VARIANT_INVALID_RESPONSE',
          'Shopify returned an invalid option response.',
          502,
        );
      }
    },

    createVariants(workspaceId, productId, variants) {
      return mutateVariants(workspaceId, productId, variants, 'create');
    },

    updateVariants(workspaceId, productId, variants) {
      return mutateVariants(workspaceId, productId, variants, 'update');
    },
  };
}
