import 'server-only';

import {
  publishUserShopifyProject,
} from '../publishing/publication-operations.server';
import {
  publishUserShopifyVariants,
} from '../variants/variant-operations.server';
import {
  publishUserShopifyMetafields,
} from '../metafields/metafield-operations.server';
import {
  publishUserShopifyImages,
  refreshUserShopifyImages,
} from '../images/image-operations.server';
import type { CoordinatorStepAdapter } from './step-adapters';
import {
  failedStep,
  normalizeImageResult,
  normalizeMetafieldResult,
  normalizeProductResult,
  normalizeVariantResult,
} from './step-adapters';

function category(error: unknown) {
  if (
    error && typeof error === 'object'
    && 'code' in error && typeof error.code === 'string'
  ) return error.code.slice(0, 100).toLowerCase();
  return 'domain_operation_failed';
}

export const coordinatorStepAdapters: CoordinatorStepAdapter[] = [
  {
    step: 'PRODUCT',
    async execute(context, attempt, freshness) {
      try {
        let result = await publishUserShopifyProject(
          context.actorUserId,
          context.projectId,
          { product: context.productInput },
        );
        if (result.outcome === 'LINK_PENDING' && result.recoveryReceipt) {
          result = await publishUserShopifyProject(
            context.actorUserId,
            context.projectId,
            {
              product: context.productInput,
              recoveryReceipt: result.recoveryReceipt,
            },
          );
        }
        return normalizeProductResult(result, attempt, freshness);
      } catch (error) {
        return failedStep('PRODUCT', attempt, freshness, true, category(error));
      }
    },
  },
  {
    step: 'VARIANTS',
    async execute(context, attempt, freshness) {
      try {
        return normalizeVariantResult(
          await publishUserShopifyVariants(
            context.actorUserId,
            context.projectId,
          ),
          attempt,
          freshness,
        );
      } catch (error) {
        return failedStep('VARIANTS', attempt, freshness, false, category(error));
      }
    },
  },
  {
    step: 'METAFIELDS',
    async execute(context, attempt, freshness) {
      try {
        return normalizeMetafieldResult(
          await publishUserShopifyMetafields(
            context.actorUserId,
            context.projectId,
          ),
          attempt,
          freshness,
        );
      } catch (error) {
        return failedStep('METAFIELDS', attempt, freshness, false, category(error));
      }
    },
  },
  {
    step: 'IMAGES',
    async execute(context, attempt, freshness) {
      try {
        return normalizeImageResult(
          await publishUserShopifyImages(
            context.actorUserId,
            context.projectId,
          ),
          attempt,
          freshness,
        );
      } catch (error) {
        return failedStep('IMAGES', attempt, freshness, false, category(error));
      }
    },
    async refreshPending(context, attempt, freshness) {
      try {
        const configuration = await refreshUserShopifyImages(
          context.actorUserId,
          context.projectId,
        );
        const pending = configuration.images.filter(({ status }) => (
          status === 'PROCESSING' || status === 'UPLOADING'
        )).length;
        const failed = configuration.images.filter(({ status }) => (
          status === 'FAILED' || status === 'MISSING_REMOTE'
        )).length;
        return normalizeImageResult({
          outcome: failed ? 'PARTIAL' : pending ? 'PENDING' : 'UNCHANGED',
          created: 0,
          updated: 0,
          unchanged: configuration.images.length - pending - failed,
          pending,
          failed,
          message: failed
            ? 'Some images need attention.'
            : pending
              ? 'Shopify is still processing images.'
              : 'Image processing is complete.',
        }, attempt, freshness);
      } catch (error) {
        return failedStep('IMAGES', attempt, freshness, false, category(error));
      }
    },
  },
];
