import type {
  ShopifyAdminRequest,
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import { ShopifyAdminApiError } from '../admin/errors.ts';
import type {
  ShopifyProductUpdatePayload,
} from './product-change-set.ts';
import { ShopifyProductPublishError } from './product-errors.ts';

export interface ShopifyProductUpdateRepository {
  findCurrent(workspaceId: string, productId: string): Promise<unknown>;
  update(
    workspaceId: string,
    productId: string,
    payload: ShopifyProductUpdatePayload,
  ): Promise<unknown>;
}

interface GraphqlProduct {
  id?: string;
  legacyResourceId?: string | number;
  title?: string;
  handle?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: string;
  updatedAt?: string;
}

interface GraphqlError {
  message?: string;
  extensions?: { code?: string };
}

interface GraphqlProductResponse {
  data?: {
    product?: GraphqlProduct | null;
    productUpdate?: {
      product?: GraphqlProduct | null;
      userErrors?: readonly {
        field?: readonly string[] | null;
        message?: string;
      }[];
    };
  };
  errors?: readonly GraphqlError[];
}

const PRODUCT_FIELDS = `
  id
  legacyResourceId
  title
  handle
  descriptionHtml
  vendor
  productType
  tags
  status
  updatedAt
`;

function productGid(productId: string): string {
  return `gid://shopify/Product/${productId}`;
}

function throwTopLevelErrors(
  result: GraphqlProductResponse,
  response: ShopifyAdminResponse,
): void {
  if (!result.errors?.length) return;
  const codes = new Set(result.errors.map((error) => error.extensions?.code));
  if (codes.has('THROTTLED')) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_RATE_LIMITED',
      message: 'Shopify is temporarily rate limiting requests.',
      statusCode: 429,
      retryable: true,
      requestId: response.requestId ?? undefined,
    });
  }
  if (codes.has('ACCESS_DENIED')) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_UNAUTHORIZED',
      message: 'Shopify rejected the stored connection credentials.',
      statusCode: 403,
      requestId: response.requestId ?? undefined,
    });
  }
  throw new ShopifyAdminApiError({
    code: 'SHOPIFY_ADMIN_INVALID_RESPONSE',
    message: 'Shopify returned an invalid response.',
    statusCode: response.status,
    requestId: response.requestId ?? undefined,
  });
}

function normalizeProduct(product: GraphqlProduct | null | undefined): unknown {
  if (!product) {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_NOT_FOUND',
      'The Shopify product was not found.',
      404,
    );
  }
  const legacyId = String(product.legacyResourceId ?? '');
  if (!/^\d+$/u.test(legacyId) || product.id !== productGid(legacyId)) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_INVALID_RESPONSE',
      message: 'Shopify returned an invalid response.',
    });
  }
  return {
    product: {
      id: legacyId,
      title: product.title,
      handle: product.handle,
      body_html: product.descriptionHtml ?? '',
      vendor: product.vendor ?? '',
      product_type: product.productType ?? '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
      status: product.status?.toLowerCase(),
      updated_at: product.updatedAt,
    },
  };
}

function graphqlUpdateInput(payload: ShopifyProductUpdatePayload) {
  const product = payload.product;
  return {
    id: productGid(product.id),
    ...(product.title === undefined ? {} : { title: product.title }),
    ...(product.body_html === undefined
      ? {}
      : { descriptionHtml: product.body_html }),
    ...(product.vendor === undefined ? {} : { vendor: product.vendor }),
    ...(product.product_type === undefined
      ? {}
      : { productType: product.product_type }),
    ...(product.tags === undefined
      ? {}
      : {
          tags: product.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
    ...(product.status === undefined
      ? {}
      : { status: product.status.toUpperCase() }),
  };
}

export function createShopifyProductUpdateRepository(
  request: (
    workspaceId: string,
    input: ShopifyAdminRequest,
  ) => Promise<ShopifyAdminResponse>,
): ShopifyProductUpdateRepository {
  return {
    async findCurrent(workspaceId, productId) {
      const response = await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        retrySafe: true,
        body: {
          query: `query ListingPilotProductForUpdate($id: ID!) {
            product(id: $id) { ${PRODUCT_FIELDS} }
          }`,
          variables: { id: productGid(productId) },
        },
      });
      const result = response.data as GraphqlProductResponse;
      throwTopLevelErrors(result, response);
      return normalizeProduct(result.data?.product);
    },
    async update(workspaceId, productId, payload) {
      if (payload.product.id !== productId) {
        throw new ShopifyAdminApiError({
          code: 'SHOPIFY_ADMIN_INVALID_REQUEST',
          message: 'The Shopify product identity is inconsistent.',
        });
      }
      const response = await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        body: {
          query: `mutation ListingPilotUpdateProduct($product: ProductUpdateInput!) {
            productUpdate(product: $product) {
              product { ${PRODUCT_FIELDS} }
              userErrors { field message }
            }
          }`,
          variables: { product: graphqlUpdateInput(payload) },
        },
      });
      const result = response.data as GraphqlProductResponse;
      throwTopLevelErrors(result, response);
      const update = result.data?.productUpdate;
      if (update?.userErrors?.length) {
        throw new ShopifyProductPublishError(
          'SHOPIFY_PRODUCT_VALIDATION_FAILED',
          'Shopify rejected the product details.',
          422,
        );
      }
      return normalizeProduct(update?.product);
    },
  };
}
