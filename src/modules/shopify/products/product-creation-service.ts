import { ZodError } from 'zod';
import {
  normalizeShopifyProductError,
  ShopifyProductPublishError,
} from './product-errors.ts';
import {
  buildShopifyProductCreatePayload,
} from './product-payload.ts';
import type {
  ShopifyProductCreationRepository,
} from './product-creation-repository.ts';
import {
  parseShopifyCreatedProduct,
  shopifyProductCreateInputSchema,
  type ShopifyCreatedProduct,
} from './product-validation.ts';

export interface ShopifyProductAuditRepository {
  recordCreated(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    product: ShopifyCreatedProduct;
  }): Promise<void>;
}

export async function createShopifyProduct(
  dependencies: {
    products: ShopifyProductCreationRepository;
    audit: ShopifyProductAuditRepository;
  },
  context: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    role: string;
  },
  untrustedInput: unknown,
): Promise<ShopifyCreatedProduct> {
  if (context.role !== 'OWNER') {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may publish Shopify products.',
      403,
    );
  }

  const input = shopifyProductCreateInputSchema.parse(untrustedInput);
  let product: ShopifyCreatedProduct;
  try {
    const response = await dependencies.products.create(
      context.workspaceId,
      buildShopifyProductCreatePayload(input),
    );
    product = parseShopifyCreatedProduct(response);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_INVALID_RESPONSE',
        'Shopify returned an invalid product response.',
        502,
        { cause: error },
      );
    }
    throw normalizeShopifyProductError(error);
  }

  await dependencies.audit.recordCreated({
    actorUserId: context.actorUserId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    product,
  });
  return product;
}
