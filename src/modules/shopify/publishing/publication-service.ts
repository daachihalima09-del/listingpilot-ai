import { z } from 'zod';
import { createShopifyProduct } from '../products/product-creation-service.ts';
import type {
  ShopifyProductCreationRepository,
} from '../products/product-creation-repository.ts';
import type {
  ShopifyProductUpdateAuditRepository,
} from '../products/product-update-service.ts';
import { updateShopifyProduct } from '../products/product-update-service.ts';
import type {
  ShopifyProductUpdateRepository,
} from '../products/product-update-repository.ts';
import {
  shopifyProductCreateInputSchema,
  type ShopifyCreatedProduct,
} from '../products/product-validation.ts';
import { shopifyProductUpdateInputSchema } from '../products/product-update-validation.ts';
import {
  ShopifyPublicationError,
} from './publication-errors.ts';
import type {
  ShopifyProductPublicationRepository,
  ShopifyPublicationProjectContext,
} from './publication-repository.ts';
import type {
  ShopifyPublishedProductReference,
} from './publication-types.ts';

const publicationRequestSchema = z.object({
  product: z.unknown(),
  recoveryReceipt: z.string().max(8_192).optional(),
}).strict();

export interface ShopifyPublicationResult {
  outcome: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'LINK_PENDING' | 'RECOVERED';
  publication: ShopifyPublishedProductReference;
  changed: boolean;
  changedFields: string[];
  recoveryReceipt?: string;
}

export interface ShopifyPublicationRecoveryProduct {
  projectId: string;
  workspaceId: string;
  product: ShopifyCreatedProduct;
}

interface PublicationDependencies {
  publications: ShopifyProductPublicationRepository;
  products: ShopifyProductCreationRepository & ShopifyProductUpdateRepository;
  updateAudit: ShopifyProductUpdateAuditRepository;
  createRecoveryReceipt(input: ShopifyPublicationRecoveryProduct): string;
}

function authorize(context: ShopifyPublicationProjectContext | null) {
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
  return context;
}

function temporaryReference(
  product: ShopifyCreatedProduct,
  publishedAt: Date,
  previous: ShopifyPublishedProductReference | null,
): ShopifyPublishedProductReference {
  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    firstPublishedAt: previous?.firstPublishedAt ?? publishedAt.toISOString(),
    lastPublishedAt: publishedAt.toISOString(),
  };
}

async function persistOrProtect(
  dependencies: PublicationDependencies,
  context: ShopifyPublicationProjectContext,
  product: ShopifyCreatedProduct,
  publishedAt: Date,
  outcome: Exclude<ShopifyPublicationResult['outcome'], 'LINK_PENDING'>,
  changed: boolean,
  changedFields: string[],
  creation: boolean,
): Promise<ShopifyPublicationResult> {
  try {
    const publication = creation
      ? await dependencies.publications.saveCreated({
          actorUserId: context.actorUserId,
          organizationId: context.organizationId,
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          product,
          publishedAt,
        })
      : await dependencies.publications.save({
          workspaceId: context.workspaceId,
          projectId: context.projectId,
          product,
          publishedAt,
        });
    return {
      outcome,
      publication,
      changed,
      changedFields,
    };
  } catch {
    const recoveryReceipt = context.publication
      ? undefined
      : dependencies.createRecoveryReceipt({
          projectId: context.projectId,
          workspaceId: context.workspaceId,
          product,
        });
    return {
      outcome: 'LINK_PENDING',
      publication: temporaryReference(product, publishedAt, context.publication),
      changed,
      changedFields,
      ...(recoveryReceipt ? { recoveryReceipt } : {}),
    };
  }
}

export async function publishShopifyProject(
  dependencies: PublicationDependencies,
  context: ShopifyPublicationProjectContext | null,
  untrustedInput: unknown,
  recovery: ShopifyPublicationRecoveryProduct | null,
): Promise<ShopifyPublicationResult> {
  const authorized = authorize(context);
  const request = publicationRequestSchema.parse(untrustedInput);
  const publishedAt = new Date();

  if (request.recoveryReceipt) {
    if (
      !recovery
      || recovery.projectId !== authorized.projectId
      || recovery.workspaceId !== authorized.workspaceId
      || authorized.publication
    ) {
      throw new ShopifyPublicationError(
        'SHOPIFY_PUBLICATION_RECOVERY_INVALID',
        'The prior Shopify publish could not be recovered safely.',
        409,
      );
    }
    return persistOrProtect(
      dependencies,
      authorized,
      recovery.product,
      publishedAt,
      'RECOVERED',
      true,
      [],
      true,
    );
  }

  if (!authorized.publication) {
    const product = await createShopifyProduct({
      products: dependencies.products,
      audit: { async recordCreated() {} },
    }, authorized, shopifyProductCreateInputSchema.parse(request.product));
    return persistOrProtect(
      dependencies,
      authorized,
      product,
      publishedAt,
      'CREATED',
      true,
      [],
      true,
    );
  }

  const update = await updateShopifyProduct({
    products: dependencies.products,
    audit: dependencies.updateAudit,
  }, authorized, authorized.publication.id, shopifyProductUpdateInputSchema.parse(
    request.product,
  ));
  const safeProduct: ShopifyCreatedProduct = {
    id: update.product.id,
    title: update.product.title,
    handle: update.product.handle,
    status: update.product.status,
  };
  return persistOrProtect(
    dependencies,
    authorized,
    safeProduct,
    publishedAt,
    update.changed ? 'UPDATED' : 'UNCHANGED',
    update.changed,
    update.changedFields,
    false,
  );
}
