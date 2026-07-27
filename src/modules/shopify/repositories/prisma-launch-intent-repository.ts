import 'server-only';

import { prisma } from '@/lib/prisma';
import type { ShopifyLaunchIntentStore } from '../launch/launch-intent-service';

const launchIntentSelect = {
  id: true,
  nonceHash: true,
  shopDomain: true,
  origin: true,
  status: true,
  requestedWorkspaceId: true,
  selectedByUserId: true,
  safeReturnPath: true,
  expiresAt: true,
  consumedAt: true,
} as const;

export const prismaShopifyLaunchIntentStore: ShopifyLaunchIntentStore = {
  create(input) {
    return prisma.shopifyLaunchIntent.create({
      data: input,
      select: launchIntentSelect,
    });
  },
  findByNonceHash(nonceHash) {
    return prisma.shopifyLaunchIntent.findUnique({
      where: { nonceHash },
      select: launchIntentSelect,
    });
  },
  findById(id) {
    return prisma.shopifyLaunchIntent.findUnique({
      where: { id },
      select: launchIntentSelect,
    });
  },
  async selectWorkspace(input) {
    const result = await prisma.shopifyLaunchIntent.updateMany({
      where: {
        id: input.id,
        consumedAt: null,
        expiresAt: { gt: input.now },
        status: { in: ['PENDING', 'WORKSPACE_SELECTED'] },
      },
      data: {
        requestedWorkspaceId: input.workspaceId,
        selectedByUserId: input.userId,
        status: 'WORKSPACE_SELECTED',
      },
    });
    return result.count === 1;
  },
  async markOAuthStarted(id, now) {
    const result = await prisma.shopifyLaunchIntent.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
        status: 'WORKSPACE_SELECTED',
      },
      data: { status: 'OAUTH_STARTED' },
    });
    return result.count === 1;
  },
  async consume(id, now) {
    const result = await prisma.shopifyLaunchIntent.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
        status: { in: ['WORKSPACE_SELECTED', 'OAUTH_STARTED'] },
      },
      data: {
        status: 'COMPLETED',
        consumedAt: now,
      },
    });
    return result.count === 1;
  },
  async expire(id) {
    await prisma.shopifyLaunchIntent.updateMany({
      where: { id, consumedAt: null },
      data: { status: 'EXPIRED' },
    });
  },
};
