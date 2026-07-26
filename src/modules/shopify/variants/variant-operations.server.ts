import 'server-only';

import { hasValidShopifyConfig } from '../config';
import {
  shopifyGraphqlVariantRepository,
} from '../repositories/shopify-graphql-variant-repository.server';
import {
  prismaShopifyVariantRepository,
} from '../repositories/prisma-variant-repository';
import {
  ShopifyVariantError,
} from './variant-errors';
import {
  getShopifyVariantConfiguration,
  publishShopifyVariants,
  saveShopifyVariantConfiguration,
} from './variant-service';

async function context(actorUserId: string, projectId: string) {
  return prismaShopifyVariantRepository.resolveProject(actorUserId, projectId);
}

export async function getUserShopifyVariants(
  actorUserId: string,
  projectId: string,
) {
  return getShopifyVariantConfiguration(
    prismaShopifyVariantRepository,
    await context(actorUserId, projectId),
  );
}

export async function saveUserShopifyVariants(
  actorUserId: string,
  projectId: string,
  untrustedInput: unknown,
) {
  return saveShopifyVariantConfiguration(
    prismaShopifyVariantRepository,
    await context(actorUserId, projectId),
    untrustedInput,
  );
}

export async function publishUserShopifyVariants(
  actorUserId: string,
  projectId: string,
) {
  if (!hasValidShopifyConfig()) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_CONFIGURATION_MISSING',
      'Shopify publishing is not configured.',
      503,
    );
  }
  return publishShopifyVariants({
    repository: prismaShopifyVariantRepository,
    shopify: shopifyGraphqlVariantRepository,
  }, await context(actorUserId, projectId));
}
