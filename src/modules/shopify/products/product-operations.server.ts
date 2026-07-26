import 'server-only';

import {
  prismaShopifyProductAuditRepository,
  prismaShopifyProductUpdateAuditRepository,
  shopifyProductCreationRepository,
  shopifyProductUpdateRepository,
} from '../repositories/prisma-product-publish-repositories';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';
import {
  createShopifyProduct,
} from './product-creation-service';
import { ShopifyProductPublishError } from './product-errors';
import { updateShopifyProduct } from './product-update-service';

export async function createUserShopifyProduct(
  actorUserId: string,
  untrustedInput: unknown,
) {
  let tenant;
  try {
    tenant = await getTenantContextForUser(actorUserId);
  } catch {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may publish Shopify products.',
      403,
    );
  }
  if (!tenant.workspace) {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may publish Shopify products.',
      403,
    );
  }

  return createShopifyProduct({
    products: shopifyProductCreationRepository,
    audit: prismaShopifyProductAuditRepository,
  }, {
    actorUserId,
    organizationId: tenant.organization.id,
    workspaceId: tenant.workspace.id,
    role: tenant.role,
  }, untrustedInput);
}

export async function updateUserShopifyProduct(
  actorUserId: string,
  productId: unknown,
  untrustedInput: unknown,
) {
  let tenant;
  try {
    tenant = await getTenantContextForUser(actorUserId);
  } catch {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may update Shopify products.',
      403,
    );
  }
  if (!tenant.workspace) {
    throw new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_FORBIDDEN',
      'Only the workspace owner may update Shopify products.',
      403,
    );
  }

  return updateShopifyProduct({
    products: shopifyProductUpdateRepository,
    audit: prismaShopifyProductUpdateAuditRepository,
  }, {
    actorUserId,
    organizationId: tenant.organization.id,
    workspaceId: tenant.workspace.id,
    role: tenant.role,
  }, productId, untrustedInput);
}
