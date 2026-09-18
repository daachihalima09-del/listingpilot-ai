import 'server-only';

import { hasValidShopifyConfig } from '../config';
import {
  prismaShopifyMetafieldRepository,
} from '../repositories/prisma-metafield-repository';
import {
  shopifyGraphqlMetafieldRepository,
} from '../repositories/shopify-graphql-metafield-repository.server';
import { ShopifyMetafieldError } from './metafield-errors';
import {
  getShopifyMetafieldConfiguration,
  publishShopifyMetafields,
  saveShopifyMetafieldConfiguration,
} from './metafield-service';
import type { RemoteMetafieldDefinition } from './graphql-metafield-repository';

async function context(actorUserId: string, projectId: string) {
  return prismaShopifyMetafieldRepository.resolveProject(actorUserId, projectId);
}

export async function getUserShopifyMetafields(
  actorUserId: string,
  projectId: string,
) {
  const project = await context(actorUserId, projectId);
  let definitions: RemoteMetafieldDefinition[] = [];
  if (project?.shopifyStoreId && shopifyGraphqlMetafieldRepository.listDefinitions) {
    try {
      definitions = await shopifyGraphqlMetafieldRepository.listDefinitions(project.workspaceId);
    } catch {
      // Local recommendations remain available when Shopify discovery is unavailable.
    }
  }
  return getShopifyMetafieldConfiguration(
    prismaShopifyMetafieldRepository,
    project,
    definitions,
  );
}

export async function saveUserShopifyMetafields(
  actorUserId: string,
  projectId: string,
  untrustedInput: unknown,
) {
  return saveShopifyMetafieldConfiguration(
    prismaShopifyMetafieldRepository,
    await context(actorUserId, projectId),
    untrustedInput,
  );
}

export async function publishUserShopifyMetafields(
  actorUserId: string,
  projectId: string,
) {
  if (!hasValidShopifyConfig()) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_UNAVAILABLE',
      'Shopify publishing is not configured.',
      503,
    );
  }
  return publishShopifyMetafields({
    repository: prismaShopifyMetafieldRepository,
    shopify: shopifyGraphqlMetafieldRepository,
  }, await context(actorUserId, projectId));
}
