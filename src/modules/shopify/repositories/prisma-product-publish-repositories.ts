import 'server-only';

import { prisma } from '@/lib/prisma';
import { requestShopifyAdminApi } from '../admin/admin-api-client.server';
import {
  createShopifyProductCreationRepository,
} from '../products/product-creation-repository';
import type {
  ShopifyProductAuditRepository,
} from '../products/product-creation-service';

export const shopifyProductCreationRepository =
  createShopifyProductCreationRepository(requestShopifyAdminApi);

export const prismaShopifyProductAuditRepository:
ShopifyProductAuditRepository = {
  async recordCreated(input) {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        action: 'shopify.product_created',
        entityType: 'ShopifyProduct',
        entityId: input.product.id,
        metadata: {
          shopifyProductId: input.product.id,
          title: input.product.title,
          handle: input.product.handle,
          status: input.product.status,
        },
      },
    });
  },
};
