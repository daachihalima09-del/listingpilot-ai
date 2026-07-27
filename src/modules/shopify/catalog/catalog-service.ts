import { z } from 'zod';
import type { ShopifyAdminApiRequester } from '../admin/admin-api-client-core.ts';
import { ShopifyAdminApiError } from '../admin/errors.ts';
import {
  SHOPIFY_CATALOG_PRODUCTS_QUERY,
  SHOPIFY_CATALOG_PRODUCT_QUERY,
} from './graphql-documents.ts';
import {
  catalogListInputSchema,
  shopifyProductGidSchema,
} from './catalog-validation.ts';
import { buildShopifyCatalogSearch } from './catalog-search.ts';
import { ShopifyCatalogError } from './catalog-errors.ts';

const moneySchema = z.object({
  amount: z.string(),
  currencyCode: z.string().min(3).max(3),
}).strict();
const catalogProductSchema = z.object({
  id: shopifyProductGidSchema,
  legacyResourceId: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  handle: z.string(),
  vendor: z.string().nullable().optional().transform((value) => value ?? ''),
  productType: z.string().nullable().optional().transform((value) => value ?? ''),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
  updatedAt: z.string().datetime(),
  featuredMedia: z.object({
    image: z.object({
      url: z.string().url(),
      altText: z.string().nullable().optional(),
    }).nullable().optional(),
  }).nullable().optional(),
  variantsCount: z.object({ count: z.number().int().nonnegative() }),
  priceRangeV2: z.object({
    minVariantPrice: moneySchema,
    maxVariantPrice: moneySchema,
  }),
}).strict();
const graphQlEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({
    message: z.string().optional(),
    extensions: z.record(z.unknown()).optional(),
  }).passthrough()).optional(),
  extensions: z.record(z.unknown()).optional(),
}).passthrough();
const listDataSchema = z.object({
  products: z.object({
    nodes: z.array(catalogProductSchema).max(50),
    pageInfo: z.object({
      hasNextPage: z.boolean(),
      endCursor: z.string().nullable(),
    }).strict(),
  }).strict(),
}).strict();

export interface CatalogImportStatus {
  status: 'NOT_IMPORTED' | 'IMPORTED' | 'PROJECT_ARCHIVED' | 'LINK_INCONSISTENT';
  projectId: string | null;
}

export interface CatalogLinkStore {
  findMany(
    workspaceId: string,
    productGids: string[],
  ): Promise<Map<string, CatalogImportStatus>>;
}

function mapRequestError(error: unknown): never {
  if (error instanceof ShopifyAdminApiError) {
    if (error.code === 'SHOPIFY_ADMIN_UNAUTHORIZED') {
      throw new ShopifyCatalogError('SHOPIFY_TOKEN_INVALID', 503, 'The Shopify connection needs attention.');
    }
    if (error.code === 'SHOPIFY_ADMIN_RATE_LIMITED') {
      throw new ShopifyCatalogError('SHOPIFY_THROTTLED', 503, 'Shopify is temporarily throttling requests.');
    }
  }
  throw new ShopifyCatalogError('SHOPIFY_UNAVAILABLE', 503, 'Shopify is temporarily unavailable.');
}

function unwrapGraphQl(value: unknown): unknown {
  const envelope = graphQlEnvelopeSchema.parse(value);
  if (envelope.errors?.length) {
    const throttled = envelope.errors.some((error) => (
      error.extensions?.code === 'THROTTLED'
    ));
    throw new ShopifyCatalogError(
      throttled ? 'SHOPIFY_THROTTLED' : 'SHOPIFY_UNAVAILABLE',
      503,
      throttled
        ? 'Shopify is temporarily throttling requests.'
        : 'Shopify is temporarily unavailable.',
    );
  }
  return envelope.data;
}

export async function listShopifyCatalog(
  dependencies: {
    requester: ShopifyAdminApiRequester;
    links: CatalogLinkStore;
  },
  workspaceId: string,
  untrustedInput: unknown,
) {
  const input = catalogListInputSchema.parse(untrustedInput);
  try {
    const response = await dependencies.requester.request({
      method: 'POST',
      path: '/graphql.json',
      body: {
        query: SHOPIFY_CATALOG_PRODUCTS_QUERY,
        variables: {
          first: 25,
          after: input.cursor ?? null,
          query: buildShopifyCatalogSearch(input),
        },
      },
      retrySafe: true,
    });
    const data = listDataSchema.parse(unwrapGraphQl(response.data));
    const links = await dependencies.links.findMany(
      workspaceId,
      data.products.nodes.map(({ id }) => id),
    );
    const products = data.products.nodes.map((product) => ({
      ...product,
      featuredImage: product.featuredMedia?.image ?? null,
      importStatus: links.get(product.id) ?? {
        status: 'NOT_IMPORTED' as const,
        projectId: null,
      },
    })).filter(({ importStatus }) => (
      input.importState === 'ALL'
      || (input.importState === 'IMPORTED' && importStatus.status !== 'NOT_IMPORTED')
      || (input.importState === 'NOT_IMPORTED' && importStatus.status === 'NOT_IMPORTED')
    ));
    return { products, pageInfo: data.products.pageInfo };
  } catch (error) {
    if (error instanceof ShopifyCatalogError || error instanceof z.ZodError) throw error;
    return mapRequestError(error);
  }
}

export async function fetchShopifyCatalogProduct(
  requester: ShopifyAdminApiRequester,
  productId: string,
): Promise<Record<string, unknown>> {
  const id = shopifyProductGidSchema.parse(productId);
  try {
    const response = await requester.request({
      method: 'POST',
      path: '/graphql.json',
      body: {
        query: SHOPIFY_CATALOG_PRODUCT_QUERY,
        variables: { id },
      },
      retrySafe: true,
    });
    const data = z.object({
      product: z.record(z.unknown()).nullable(),
    }).parse(unwrapGraphQl(response.data));
    if (!data.product) {
      throw new ShopifyCatalogError('PRODUCT_NOT_FOUND', 404, 'The Shopify product is unavailable.');
    }
    return data.product;
  } catch (error) {
    if (error instanceof ShopifyCatalogError || error instanceof z.ZodError) throw error;
    return mapRequestError(error);
  }
}

