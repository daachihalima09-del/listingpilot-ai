import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  disconnectShopifyStore,
  type ShopifyDisconnectDatabase,
  type ShopifyDisconnectTransaction,
} from '../services/disconnect-store';

const database: ShopifyDisconnectDatabase = {
  $transaction(operation, options) {
    return prisma.$transaction(async (transaction) => {
      const adapter: ShopifyDisconnectTransaction = {
        shopifyStore: {
          findUnique: (args) => transaction.shopifyStore.findUnique(args),
          update: (args) => transaction.shopifyStore.update({
            ...args,
            select: { id: true },
          }),
        },
        auditLog: {
          create: (args) => transaction.auditLog.create({
            data: args.data,
            select: { id: true },
          }),
        },
      };
      return operation(adapter);
    }, options);
  },
};

export function disconnectPrismaShopifyStore(input: {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  role: string;
}) {
  return disconnectShopifyStore(database, input);
}
