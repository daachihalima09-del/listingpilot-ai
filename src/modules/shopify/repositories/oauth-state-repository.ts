import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  hashShopifyOAuthState,
  type ShopifyOAuthStateBinding,
} from '../oauth/state';
import { ShopifyCallbackError } from '../types/errors';

export async function createShopifyOAuthState(input: {
  state: string;
  userId: string;
  workspaceId: string;
  shopDomain: string;
  expiresAt: Date;
  launchIntentId?: string | null;
}): Promise<void> {
  await prisma.shopifyOAuthState.create({
    data: {
      stateHash: hashShopifyOAuthState(input.state),
      userId: input.userId,
      workspaceId: input.workspaceId,
      shopDomain: input.shopDomain,
      expiresAt: input.expiresAt,
      launchIntentId: input.launchIntentId ?? null,
    },
  });
}

export async function findShopifyOAuthState(
  stateHash: string,
): Promise<(ShopifyOAuthStateBinding & { id: string }) | null> {
  return prisma.shopifyOAuthState.findUnique({
    where: { stateHash },
    select: {
      id: true,
      stateHash: true,
      userId: true,
      workspaceId: true,
      shopDomain: true,
      expiresAt: true,
      consumedAt: true,
      launchIntentId: true,
    },
  });
}

export async function consumeShopifyOAuthState(
  stateId: string,
  consumedAt: Date,
): Promise<void> {
  const result = await prisma.shopifyOAuthState.updateMany({
    where: {
      id: stateId,
      consumedAt: null,
      expiresAt: { gt: consumedAt },
    },
    data: { consumedAt },
  });
  if (result.count !== 1) {
    throw new ShopifyCallbackError('invalid_state', 'state_replayed');
  }
}
