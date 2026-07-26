import 'server-only';

import { hasValidShopifyConfig } from '../config';
import {
  prismaPublicationCoordinatorRepository,
} from '../repositories/prisma-publication-coordinator-repository';
import { ShopifyCoordinatorError } from './coordinator-error';
import {
  getCoordinatorExecution,
  runCoordinator,
} from './coordinator-service';
import { coordinatorStepAdapters } from './step-adapters.server';
import type { CoordinatorTrigger } from './coordinator-types';

function context(userId: string, projectId: string) {
  return prismaPublicationCoordinatorRepository.resolveProject(userId, projectId);
}

export async function getUserPublicationCoordinator(
  userId: string,
  projectId: string,
) {
  return getCoordinatorExecution(
    prismaPublicationCoordinatorRepository,
    await context(userId, projectId),
  );
}

export async function runUserPublicationCoordinator(
  userId: string,
  projectId: string,
  triggerType: CoordinatorTrigger,
) {
  if (!hasValidShopifyConfig()) {
    throw new ShopifyCoordinatorError(
      'SHOPIFY_COORDINATOR_CONFIGURATION_MISSING',
      'Shopify publishing is not configured.',
      503,
    );
  }
  return runCoordinator({
    repository: prismaPublicationCoordinatorRepository,
    adapters: coordinatorStepAdapters,
  }, await context(userId, projectId), triggerType);
}
