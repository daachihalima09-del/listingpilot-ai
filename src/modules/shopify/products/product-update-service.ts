import { ZodError } from 'zod';
import {
  calculateShopifyProductChangeSet,
  type ShopifyProductUpdateField,
} from './product-change-set.ts';
import {
  normalizeShopifyProductError,
  ShopifyProductPublishError,
} from './product-errors.ts';
import type {
  ShopifyProductUpdateRepository,
} from './product-update-repository.ts';
import {
  parseShopifyProductState,
  shopifyProductIdSchema,
  shopifyProductUpdateInputSchema,
  type ShopifyProductState,
} from './product-update-validation.ts';

export interface ShopifyProductUpdateAuditRepository {
  recordUpdated(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    product: {
      id: string;
      status: 'ACTIVE' | 'DRAFT';
    };
    changedFields: ShopifyProductUpdateField[];
  }): Promise<void>;
}

export interface ShopifyProductUpdateResult {
  product: {
    id: string;
    title: string;
    handle: string;
    status: 'ACTIVE' | 'DRAFT';
    updatedAt: string | null;
  };
  changed: boolean;
  changedFields: ShopifyProductUpdateField[];
}

function clientSafeProduct(product: ShopifyProductState) {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    updatedAt: product.updatedAt,
  };
}

function invalidResponse(error: unknown): ShopifyProductPublishError {
  return new ShopifyProductPublishError(
    'SHOPIFY_PRODUCT_INVALID_RESPONSE',
    'Shopify returned an invalid product response.',
    502,
    { cause: error },
  );
}

export async function updateShopifyProduct(
  dependencies: {
    products: ShopifyProductUpdateRepository;
    audit: ShopifyProductUpdateAuditRepository;
  },
  context: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    role: string;
  },
  untrustedProductId: unknown,
  untrustedInput: unknown,
): Promise<ShopifyProductUpdateResult> {
  if (context.role !== 'OWNER') {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may update Shopify products.',
      403,
    );
  }
  const productId = shopifyProductIdSchema.parse(untrustedProductId);
  const requested = shopifyProductUpdateInputSchema.parse(untrustedInput);

  let current: ShopifyProductState;
  try {
    current = parseShopifyProductState(
      await dependencies.products.findCurrent(context.workspaceId, productId),
    );
  } catch (error) {
    if (error instanceof ZodError) throw invalidResponse(error);
    throw normalizeShopifyProductError(error);
  }
  if (current.id !== productId) throw invalidResponse(new Error('ID mismatch'));

  const changeSet = calculateShopifyProductChangeSet(current, requested);
  if (changeSet.changedFields.length === 0) {
    return {
      product: clientSafeProduct(current),
      changed: false,
      changedFields: [],
    };
  }

  let updated: ShopifyProductState;
  try {
    updated = parseShopifyProductState(
      await dependencies.products.update(
        context.workspaceId,
        productId,
        changeSet.payload,
      ),
    );
  } catch (error) {
    if (error instanceof ZodError) throw invalidResponse(error);
    throw normalizeShopifyProductError(error);
  }
  if (updated.id !== productId) throw invalidResponse(new Error('ID mismatch'));

  await dependencies.audit.recordUpdated({
    actorUserId: context.actorUserId,
    organizationId: context.organizationId,
    workspaceId: context.workspaceId,
    product: {
      id: updated.id,
      status: updated.status,
    },
    changedFields: changeSet.changedFields,
  });
  return {
    product: clientSafeProduct(updated),
    changed: true,
    changedFields: changeSet.changedFields,
  };
}
