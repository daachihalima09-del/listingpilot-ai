import type {
  ShopifyGraphqlVariantRepository,
} from './graphql-variant-repository.ts';
import {
  ShopifyVariantError,
  normalizeShopifyVariantError,
} from './variant-errors.ts';
import type {
  PersistedShopifyVariantConfiguration,
  ShopifyVariantProjectContext,
  ShopifyVariantRepository,
} from './variant-repository.ts';
import {
  buildShopifyVariantSynchronizationPlan,
  missingShopifyOptions,
} from './variant-sync-plan.ts';
import {
  shopifyVariantConfigurationSchema,
  type ShopifyVariantConfigurationDto,
} from './variant-validation.ts';

export interface ShopifyVariantPublishResult {
  outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL';
  created: number;
  updated: number;
  unchanged: number;
  unmanagedRemote: number;
  currencyCode: string | null;
  message: string;
  configuration: ShopifyVariantConfigurationDto;
}

function requireProject(context: ShopifyVariantProjectContext | null) {
  if (!context) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_PROJECT_NOT_FOUND',
      'The requested project is unavailable.',
      404,
    );
  }
  return context;
}

function requireOwner(context: ShopifyVariantProjectContext | null) {
  const project = requireProject(context);
  if (project.role !== 'OWNER') {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_FORBIDDEN',
      'Store-owner permission is required to manage Shopify variants.',
      403,
    );
  }
  if (project.archived) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_PROJECT_ARCHIVED',
      'Restore this project before changing Shopify variants.',
      409,
    );
  }
  return project;
}

function validatedPersistedConfiguration(
  configuration: PersistedShopifyVariantConfiguration,
) {
  return shopifyVariantConfigurationSchema.parse({
    version: configuration.version,
    options: configuration.options,
    variants: configuration.variants
      .filter(({ active }) => active)
      .sort((left, right) => left.position - right.position)
      .map((variant) => ({
        optionValues: variant.optionValues,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        sku: variant.sku,
        barcode: variant.barcode,
      })),
  });
}

async function partialResult(
  repository: ShopifyVariantRepository,
  context: ShopifyVariantProjectContext,
  counts: {
    created: number;
    updated: number;
    unchanged: number;
    unmanagedRemote: number;
  },
  currencyCode: string | null,
  failureCategory: string,
): Promise<ShopifyVariantPublishResult> {
  if (context.shopifyProductId) {
    try {
      await repository.createAudit({
        actorUserId: context.actorUserId,
        organizationId: context.organizationId,
        workspaceId: context.workspaceId,
        projectId: context.projectId,
        shopifyProductId: context.shopifyProductId,
        action: 'shopify.variant_publish_partial',
        metadata: {
          created: counts.created,
          updated: counts.updated,
          unchanged: counts.unchanged,
          localVariantIds: [],
          failureCategory,
        },
      });
    } catch {
      // The client still receives an honest partial result if audit storage fails.
    }
  }
  return {
    outcome: 'PARTIAL',
    ...counts,
    currencyCode,
    message: 'Some Shopify variant work completed, but publishing needs to be resumed.',
    configuration: await repository.getDto(
      context.workspaceId,
      context.projectId,
    ),
  };
}

export async function getShopifyVariantConfiguration(
  repository: ShopifyVariantRepository,
  context: ShopifyVariantProjectContext | null,
): Promise<ShopifyVariantConfigurationDto> {
  const project = requireProject(context);
  return repository.getDto(project.workspaceId, project.projectId);
}

export async function saveShopifyVariantConfiguration(
  repository: ShopifyVariantRepository,
  context: ShopifyVariantProjectContext | null,
  untrustedInput: unknown,
): Promise<ShopifyVariantConfigurationDto> {
  const project = requireOwner(context);
  const configuration = shopifyVariantConfigurationSchema.parse(untrustedInput);
  const saved = await repository.saveConfiguration({
    workspaceId: project.workspaceId,
    projectId: project.projectId,
    configuration,
  });
  if (!saved) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_CONFIG_CONFLICT',
      'A newer variant configuration exists. Refresh before saving.',
      409,
    );
  }
  return saved;
}

export async function publishShopifyVariants(
  dependencies: {
    repository: ShopifyVariantRepository;
    shopify: ShopifyGraphqlVariantRepository;
  },
  context: ShopifyVariantProjectContext | null,
): Promise<ShopifyVariantPublishResult> {
  const project = requireOwner(context);
  if (!project.shopifyProductId) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_PRODUCT_NOT_LINKED',
      'Publish the Shopify product before publishing variants.',
      409,
    );
  }
  if (!project.configuration) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_VALIDATION_FAILED',
      'Save a valid variant configuration before publishing.',
      422,
    );
  }
  validatedPersistedConfiguration(project.configuration);

  let remote;
  try {
    remote = await dependencies.shopify.getCurrent(
      project.workspaceId,
      project.shopifyProductId,
    );
  } catch (error) {
    throw normalizeShopifyVariantError(error);
  }
  if (
    project.configuration.options.length > remote.maxProductOptions
    || project.configuration.variants.filter(({ active }) => active).length
      > remote.maxProductVariants
  ) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_VALIDATION_FAILED',
      'The variant configuration exceeds this Shopify store’s limits.',
      422,
    );
  }

  const remoteOptionNames = new Set(
    (remote.hasOnlyDefaultVariant ? [] : remote.options)
      .map(({ name }) => name.trim().toLocaleLowerCase('en-US')),
  );
  const localOptionNames = new Set(
    project.configuration.options
      .map(({ name }) => name.trim().toLocaleLowerCase('en-US')),
  );
  if ([...remoteOptionNames].some((name) => !localOptionNames.has(name))) {
    throw new ShopifyVariantError(
      'SHOPIFY_VARIANT_OPTION_CONFLICT',
      'Shopify has options that ListingPilot will not remove or replace.',
      409,
    );
  }

  const plan = buildShopifyVariantSynchronizationPlan(
    project.configuration,
    remote,
  );
  const counts = {
    created: 0,
    updated: 0,
    unchanged: plan.unchanged.length,
    unmanagedRemote: plan.missingLocally.length,
  };
  if (plan.missingRemotely.length) {
    return partialResult(
      dependencies.repository,
      project,
      counts,
      remote.currencyCode,
      'persisted_variant_missing_remotely',
    );
  }

  for (const recovered of plan.recoveredLinks) {
    try {
      await dependencies.repository.linkVariant({
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        localVariantId: recovered.localVariantId,
        shopifyVariantId: recovered.shopifyVariantId,
        publishedAt: new Date(),
      });
    } catch {
      return partialResult(
        dependencies.repository,
        project,
        counts,
        remote.currencyCode,
        'reconciliation_persistence_failed',
      );
    }
  }

  let optionsCreated = false;
  try {
    const options = missingShopifyOptions(project.configuration.options, remote);
    if (options.length && !remote.hasOnlyDefaultVariant) {
      throw new ShopifyVariantError(
        'SHOPIFY_VARIANT_OPTION_CONFLICT',
        'Adding options to an existing multi-variant Shopify product is not supported safely.',
        409,
      );
    }
    if (options.length) {
      await dependencies.shopify.createOptions(
        project.workspaceId,
        project.shopifyProductId,
        options,
      );
      optionsCreated = true;
    }

    if (plan.update.length) {
      const updated = await dependencies.shopify.updateVariants(
        project.workspaceId,
        project.shopifyProductId,
        plan.update.map(({ mutation }) => mutation),
      );
      counts.updated = updated.length;
      await dependencies.repository.touchVariants({
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        localVariantIds: updated.map(({ localVariantId }) => localVariantId),
        publishedAt: new Date(),
      });
      await dependencies.repository.createAudit({
        actorUserId: project.actorUserId,
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        shopifyProductId: project.shopifyProductId,
        action: 'shopify.variants_updated',
        metadata: {
          created: 0,
          updated: updated.length,
          unchanged: plan.unchanged.length,
          localVariantIds: updated.map(({ localVariantId }) => localVariantId),
        },
      });
    }

    if (plan.create.length) {
      const created = await dependencies.shopify.createVariants(
        project.workspaceId,
        project.shopifyProductId,
        plan.create.map(({ mutation }) => mutation),
      );
      counts.created = created.length;
      for (const createdVariant of created) {
        await dependencies.repository.linkVariant({
          workspaceId: project.workspaceId,
          projectId: project.projectId,
          localVariantId: createdVariant.localVariantId,
          shopifyVariantId: createdVariant.variant.id,
          publishedAt: new Date(),
        });
      }
      await dependencies.repository.createAudit({
        actorUserId: project.actorUserId,
        organizationId: project.organizationId,
        workspaceId: project.workspaceId,
        projectId: project.projectId,
        shopifyProductId: project.shopifyProductId,
        action: 'shopify.variants_created',
        metadata: {
          created: created.length,
          updated: 0,
          unchanged: plan.unchanged.length,
          localVariantIds: created.map(({ localVariantId }) => localVariantId),
        },
      });
    }
  } catch (error) {
    if (optionsCreated || counts.created || counts.updated) {
      return partialResult(
        dependencies.repository,
        project,
        counts,
        remote.currencyCode,
        'shopify_or_persistence_failure',
      );
    }
    throw normalizeShopifyVariantError(error);
  }

  await dependencies.repository.touchVariants({
    workspaceId: project.workspaceId,
    projectId: project.projectId,
    localVariantIds: plan.unchanged.map(({ local }) => local.id),
    publishedAt: new Date(),
  });
  return {
    outcome: counts.created || counts.updated ? 'PUBLISHED' : 'UNCHANGED',
    ...counts,
    currencyCode: remote.currencyCode,
    message: counts.created || counts.updated
      ? 'Shopify variants were published successfully.'
      : 'No Shopify variant changes were required.',
    configuration: await dependencies.repository.getDto(
      project.workspaceId,
      project.projectId,
    ),
  };
}
