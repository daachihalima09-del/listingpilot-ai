import 'server-only';

import { prisma } from '@/lib/prisma';
import { hasValidShopifyConfig } from '../config';
import {
  shopifyProductCreationRepository,
  shopifyProductUpdateRepository,
  prismaShopifyProductUpdateAuditRepository,
} from '../repositories/prisma-product-publish-repositories';
import {
  prismaShopifyProductPublicationRepository,
} from '../repositories/prisma-product-publication-repository';
import {
  ShopifyPublicationError,
} from './publication-errors';
import {
  createShopifyPublicationRecoveryReceipt,
  parseShopifyPublicationRecoveryReceipt,
} from './publication-receipt.server';
import {
  publishShopifyProject,
  type ShopifyPublicationRecoveryProduct,
} from './publication-service';
import {
  buildTrustedShopifyAdminProductUrl,
} from './publishing-view';

function recoveryReceiptFromInput(input: unknown): string | null {
  if (
    !input
    || typeof input !== 'object'
    || Array.isArray(input)
    || !('recoveryReceipt' in input)
  ) return null;
  return typeof input.recoveryReceipt === 'string'
    ? input.recoveryReceipt
    : null;
}

export async function publishUserShopifyProject(
  actorUserId: string,
  projectId: string,
  untrustedInput: unknown,
) {
  const context = await prismaShopifyProductPublicationRepository.resolveProject(
    actorUserId,
    projectId,
  );
  if (!context) {
    throw new ShopifyPublicationError(
      'SHOPIFY_PUBLICATION_NOT_FOUND',
      'The requested project is unavailable.',
      404,
    );
  }
  if (context.role !== 'OWNER') {
    throw new ShopifyPublicationError(
      'SHOPIFY_PUBLICATION_FORBIDDEN',
      'Store-owner permission is required to publish to Shopify.',
      403,
    );
  }
  if (!hasValidShopifyConfig()) {
    throw new ShopifyPublicationError(
      'SHOPIFY_CONFIGURATION_MISSING',
      'Shopify publishing is not configured.',
      503,
    );
  }

  let recovery: ShopifyPublicationRecoveryProduct | null = null;
  const serializedReceipt = recoveryReceiptFromInput(untrustedInput);
  if (serializedReceipt) {
    try {
      const decoded = parseShopifyPublicationRecoveryReceipt(serializedReceipt);
      recovery = {
        projectId: decoded.projectId,
        workspaceId: decoded.workspaceId,
        product: decoded.product,
      };
    } catch {
      throw new ShopifyPublicationError(
        'SHOPIFY_PUBLICATION_RECOVERY_INVALID',
        'The prior Shopify publish could not be recovered safely.',
        409,
      );
    }
  }

  const result = await publishShopifyProject({
    publications: prismaShopifyProductPublicationRepository,
    products: {
      create: (...args) => shopifyProductCreationRepository.create(...args),
      findCurrent: (...args) => shopifyProductUpdateRepository.findCurrent(...args),
      update: (...args) => shopifyProductUpdateRepository.update(...args),
    },
    updateAudit: prismaShopifyProductUpdateAuditRepository,
    createRecoveryReceipt: createShopifyPublicationRecoveryReceipt,
  }, context, untrustedInput, recovery);
  const store = await prisma.shopifyStore.findFirst({
    where: {
      workspaceId: context.workspaceId,
      status: { in: ['CONNECTED', 'ACTIVE'] },
    },
    select: { shopDomain: true },
  });
  return {
    ...result,
    adminUrl: buildTrustedShopifyAdminProductUrl(
      store?.shopDomain,
      result.publication.id,
    ),
  };
}
