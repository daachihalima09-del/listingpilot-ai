import 'server-only';

import { hasValidShopifyConfig } from '../config';
import { prismaShopifyImageRepository } from '../repositories/prisma-image-repository';
import {
  shopifyGraphqlImageRepository,
} from '../repositories/shopify-graphql-image-repository.server';
import { ShopifyImageError } from './image-errors';
import {
  addRemoteShopifyImage,
  addManagedRemoteImage,
  completeShopifyImageUpload,
  getShopifyImages,
  initiateShopifyImageUpload,
  publishShopifyImages,
  refreshShopifyImages,
  saveShopifyImages,
} from './image-service';

function context(actorUserId: string, projectId: string) {
  return prismaShopifyImageRepository.resolveProject(actorUserId, projectId);
}

function configured() {
  if (!hasValidShopifyConfig()) {
    throw new ShopifyImageError(
      'SHOPIFY_IMAGE_UNAVAILABLE',
      'Shopify publishing is not configured.',
      503,
    );
  }
}

const dependencies = {
  repository: prismaShopifyImageRepository,
  shopify: shopifyGraphqlImageRepository,
};

export async function getUserShopifyImages(userId: string, projectId: string) {
  return getShopifyImages(await context(userId, projectId));
}

export async function saveUserShopifyImages(
  userId: string,
  projectId: string,
  input: unknown,
) {
  return saveShopifyImages(
    prismaShopifyImageRepository,
    await context(userId, projectId),
    input,
  );
}

export async function addUserRemoteShopifyImage(
  userId: string,
  projectId: string,
  input: unknown,
) {
  configured();
  return addRemoteShopifyImage(
    dependencies,
    await context(userId, projectId),
    input,
  );
}

export async function addUserManagedRemoteImage(
  userId: string,
  productId: string,
  input: unknown,
  provenance: { sourceKind: string; sourcePageUrl: string; sourceImageId?: string },
) {
  return addManagedRemoteImage(
    prismaShopifyImageRepository,
    await context(userId, productId),
    input,
    provenance,
  );
}

export async function initiateUserShopifyImageUpload(
  userId: string,
  projectId: string,
  input: unknown,
) {
  configured();
  return initiateShopifyImageUpload(
    prismaShopifyImageRepository,
    await context(userId, projectId),
    input,
  );
}

export async function completeUserShopifyImageUpload(
  userId: string,
  projectId: string,
  uploadId: string,
  file: File,
) {
  configured();
  return completeShopifyImageUpload(
    dependencies,
    await context(userId, projectId),
    uploadId,
    file,
  );
}

export async function publishUserShopifyImages(
  userId: string,
  projectId: string,
) {
  configured();
  return publishShopifyImages(dependencies, await context(userId, projectId));
}

export async function refreshUserShopifyImages(
  userId: string,
  projectId: string,
) {
  configured();
  return refreshShopifyImages(dependencies, await context(userId, projectId));
}
