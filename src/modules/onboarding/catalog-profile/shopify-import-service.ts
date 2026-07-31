import { z } from 'zod';
import type { ShopifyAdminApiRequester } from '../../shopify/admin/admin-api-client-core.ts';
import { ShopifyAdminApiError } from '../../shopify/admin/errors.ts';
import { MerchantCatalogProfileError } from './errors.ts';
import {
  MERCHANT_CATALOG_COLLECTIONS_QUERY,
  MERCHANT_CATALOG_PRODUCTS_QUERY,
} from './shopify-import-graphql.ts';
import type { MerchantCatalogProfileValues } from './types.ts';
import {
  merchantCatalogComparisonKey,
  normalizeMerchantCatalogValue,
} from './validation.ts';

const PAGE_SIZE = 250;
const MAXIMUM_PAGES_PER_RESOURCE = 200;

const pageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
}).strict();
const envelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({
    message: z.string().optional(),
    extensions: z.record(z.unknown()).optional(),
  }).passthrough()).optional(),
}).passthrough();
const collectionsDataSchema = z.object({
  collections: z.object({
    nodes: z.array(z.object({ title: z.string() }).strict()).max(PAGE_SIZE),
    pageInfo: pageInfoSchema,
  }).strict(),
}).strict();
const productsDataSchema = z.object({
  products: z.object({
    nodes: z.array(z.object({
      productType: z.string().nullable().optional(),
      vendor: z.string().nullable().optional(),
    }).strict()).max(PAGE_SIZE),
    pageInfo: pageInfoSchema,
  }).strict(),
}).strict();

function unwrapGraphQl(value: unknown): unknown {
  const envelope = envelopeSchema.parse(value);
  if (envelope.errors?.length || !envelope.data) {
    throw new MerchantCatalogProfileError(
      'SHOPIFY_UNAVAILABLE',
      503,
      'Shopify catalog values are temporarily unavailable.',
    );
  }
  return envelope.data;
}

function safeImportError(error: unknown): never {
  if (error instanceof MerchantCatalogProfileError) throw error;
  if (error instanceof ShopifyAdminApiError) {
    throw new MerchantCatalogProfileError(
      error.code === 'SHOPIFY_STORE_NOT_CONNECTED'
        || error.code === 'SHOPIFY_ADMIN_UNAUTHORIZED'
        ? 'SHOPIFY_NOT_CONNECTED'
        : 'SHOPIFY_UNAVAILABLE',
      503,
      error.code === 'SHOPIFY_STORE_NOT_CONNECTED'
        || error.code === 'SHOPIFY_ADMIN_UNAUTHORIZED'
        ? 'The Shopify connection needs attention before catalog import.'
        : 'Shopify catalog values are temporarily unavailable.',
      { cause: error },
    );
  }
  throw new MerchantCatalogProfileError(
    'SHOPIFY_UNAVAILABLE',
    503,
    'Shopify catalog values are temporarily unavailable.',
    { cause: error },
  );
}

function uniqueSorted(values: string[]): string[] {
  const unique = new Map<string, string>();
  for (const rawValue of values) {
    const value = normalizeMerchantCatalogValue(rawValue);
    if (!value) continue;
    if (value.length > 255) {
      throw new MerchantCatalogProfileError(
        'SHOPIFY_UNAVAILABLE',
        503,
        'Shopify returned a catalog value that cannot be imported safely.',
      );
    }
    const key = merchantCatalogComparisonKey(value);
    if (!unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((left, right) => (
    left.localeCompare(right, 'en-US', { sensitivity: 'base' })
  ));
}

function nextCursor(
  pageInfo: z.infer<typeof pageInfoSchema>,
  seenCursors: Set<string>,
): string | null {
  if (!pageInfo.hasNextPage) return null;
  if (!pageInfo.endCursor || seenCursors.has(pageInfo.endCursor)) {
    throw new MerchantCatalogProfileError(
      'SHOPIFY_UNAVAILABLE',
      503,
      'Shopify catalog pagination could not be completed safely.',
    );
  }
  seenCursors.add(pageInfo.endCursor);
  return pageInfo.endCursor;
}

async function importCollections(
  requester: ShopifyAdminApiRequester,
): Promise<string[]> {
  const values: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAXIMUM_PAGES_PER_RESOURCE; page += 1) {
    const response = await requester.request({
      method: 'POST',
      path: '/graphql.json',
      body: {
        query: MERCHANT_CATALOG_COLLECTIONS_QUERY,
        variables: { first: PAGE_SIZE, after: cursor },
      },
      retrySafe: true,
    });
    const data = collectionsDataSchema.parse(unwrapGraphQl(response.data));
    values.push(...data.collections.nodes.map(({ title }) => title));
    cursor = nextCursor(data.collections.pageInfo, seenCursors);
    if (!cursor) return uniqueSorted(values);
  }
  throw new MerchantCatalogProfileError(
    'SHOPIFY_UNAVAILABLE',
    503,
    'The Shopify collection catalog is too large to import safely.',
  );
}

async function importProductFields(
  requester: ShopifyAdminApiRequester,
): Promise<{ productTypes: string[]; vendors: string[] }> {
  const productTypes: string[] = [];
  const vendors: string[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < MAXIMUM_PAGES_PER_RESOURCE; page += 1) {
    const response = await requester.request({
      method: 'POST',
      path: '/graphql.json',
      body: {
        query: MERCHANT_CATALOG_PRODUCTS_QUERY,
        variables: { first: PAGE_SIZE, after: cursor },
      },
      retrySafe: true,
    });
    const data = productsDataSchema.parse(unwrapGraphQl(response.data));
    for (const product of data.products.nodes) {
      if (product.productType) productTypes.push(product.productType);
      if (product.vendor) vendors.push(product.vendor);
    }
    cursor = nextCursor(data.products.pageInfo, seenCursors);
    if (!cursor) {
      return {
        productTypes: uniqueSorted(productTypes),
        vendors: uniqueSorted(vendors),
      };
    }
  }
  throw new MerchantCatalogProfileError(
    'SHOPIFY_UNAVAILABLE',
    503,
    'The Shopify product catalog is too large to import safely.',
  );
}

export async function importMerchantCatalogValues(
  requester: ShopifyAdminApiRequester,
): Promise<MerchantCatalogProfileValues> {
  try {
    const collections = await importCollections(requester);
    const productFields = await importProductFields(requester);
    return { collections, ...productFields };
  } catch (error) {
    return safeImportError(error);
  }
}
