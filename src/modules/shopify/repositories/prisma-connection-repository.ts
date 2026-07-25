import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  persistShopifyConnection,
  type ShopifyConnectionDatabase,
  type PersistShopifyConnectionInput,
} from '../services/connection-persistence';

const database: ShopifyConnectionDatabase = {
  $transaction(operation, options) {
    return prisma.$transaction(async (transaction) => operation({
      shopifyStore: {
        async findUnique(args) {
          if (args.where.shopDomain) {
            return transaction.shopifyStore.findUnique({
              where: { shopDomain: args.where.shopDomain },
              select: args.select,
            });
          }
          if (args.where.workspaceId) {
            return transaction.shopifyStore.findUnique({
              where: { workspaceId: args.where.workspaceId },
              select: args.select,
            });
          }
          return null;
        },
        create: (args) => transaction.shopifyStore.create(args),
        update: (args) => transaction.shopifyStore.update(args),
      },
      auditLog: {
        create: (args) => transaction.auditLog.create({
          data: args.data,
          select: { id: true },
        }),
      },
    }), options);
  },
};

export function persistPrismaShopifyConnection(
  input: PersistShopifyConnectionInput,
) {
  return persistShopifyConnection(database, input);
}

export async function recordShopifyOAuthFailure(input: {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  shopDomain: string;
  category: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
      action: 'shopify.oauth_failed',
      entityType: 'ShopifyStore',
      metadata: {
        shopDomain: input.shopDomain,
        category: input.category,
      },
    },
  });
}
