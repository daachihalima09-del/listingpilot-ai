import type {
  ShopifyAdminRequest,
  ShopifyAdminResponse,
} from '../admin/admin-api-client-core.ts';
import type {
  ShopifyProductCreatePayload,
} from './product-payload.ts';
import { ShopifyProductPublishError } from './product-errors.ts';

export interface ShopifyProductCreationRepository {
  create(
    workspaceId: string,
    payload: ShopifyProductCreatePayload,
  ): Promise<unknown>;
}

export function createShopifyProductCreationRepository(
  request: (
    workspaceId: string,
    input: ShopifyAdminRequest,
  ) => Promise<ShopifyAdminResponse>,
): ShopifyProductCreationRepository {
  return {
    async create(workspaceId, payload) {
      const product = payload.product;
      const response = await request(workspaceId, {
        method: 'POST',
        path: '/graphql.json',
        body: {
          query: `mutation ListingPilotCreateProduct($product: ProductCreateInput!) {
            productCreate(product: $product) {
              product { id title handle status }
              userErrors { field message }
            }
          }`,
          variables: {
            product: {
              title: product.title,
              ...(product.body_html === undefined ? {} : { descriptionHtml: product.body_html }),
              ...(product.vendor === undefined ? {} : { vendor: product.vendor }),
              ...(product.product_type === undefined ? {} : { productType: product.product_type }),
              ...(product.tags ? { tags: product.tags.split(',').map((tag) => tag.trim()).filter(Boolean) } : {}),
              status: product.status.toUpperCase(),
            },
          },
        },
      });
      const result = response.data as { data?: { productCreate?: { product?: { id?: string; title?: string; handle?: string; status?: string }; userErrors?: readonly { field?: readonly string[] | null; message?: string }[] } } };
      const created = result.data?.productCreate;
      if (created?.userErrors?.length) {
        throw new ShopifyProductPublishError('SHOPIFY_PRODUCT_VALIDATION_FAILED', 'Shopify rejected the product details.', 422);
      }
      const remote = created?.product;
      const id = remote?.id?.match(/^gid:\/\/shopify\/Product\/(\d+)$/u)?.[1];
      if (!id || !remote?.title || !remote.handle || !remote.status) {
        throw new ShopifyProductPublishError('SHOPIFY_PRODUCT_INVALID_RESPONSE', 'Shopify returned an invalid product response.', 502);
      }
      return { product: { id, title: remote.title, handle: remote.handle, status: remote.status.toLowerCase() } };
    },
  };
}
