import {
  SHOPIFY_METAFIELD_CATALOG,
  SHOPIFY_METAFIELD_CATALOG_VERSION,
  getMetafieldCatalogDefinition,
} from './metafield-catalog.ts';
import {
  ShopifyMetafieldDefinitionRaceError,
  ShopifyMetafieldError,
  normalizeShopifyMetafieldError,
} from './metafield-errors.ts';
import type {
  MetafieldSetInput,
  RemoteMetafieldDefinition,
  ShopifyGraphqlMetafieldRepository,
} from './graphql-metafield-repository.ts';
import {
  mapProjectToMetafields,
  metafieldValueHash,
  type MappedMetafield,
} from './metafield-mapping.ts';
import type {
  ShopifyMetafieldConfigurationDto,
  ShopifyMetafieldProjectContext,
  ShopifyMetafieldRepository,
} from './metafield-repository.ts';
import {
  buildMetafieldSynchronizationPlan,
  deterministicMetafieldBatches,
  type DefinitionConflict,
  type LocalMetafield,
} from './metafield-sync-plan.ts';
import {
  metafieldConfigurationInputSchema,
  normalizeMetafieldValue,
} from './metafield-validation.ts';

export interface ShopifyMetafieldPublishResult {
  outcome: 'PUBLISHED' | 'UNCHANGED' | 'PARTIAL';
  created: number;
  updated: number;
  unchanged: number;
  conflicted: number;
  batchCount: number;
  message: string;
  configuration: ShopifyMetafieldConfigurationDto;
}

function requireProject(context: ShopifyMetafieldProjectContext | null) {
  if (!context) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_PROJECT_NOT_FOUND',
      'The requested project is unavailable.',
      404,
    );
  }
  return context;
}

function requireOwner(context: ShopifyMetafieldProjectContext | null) {
  const project = requireProject(context);
  if (project.role !== 'OWNER') {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_FORBIDDEN',
      'Store-owner permission is required to manage Shopify metafields.',
      403,
    );
  }
  if (project.archived) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_PROJECT_ARCHIVED',
      'Restore this project before changing Shopify metafields.',
      409,
    );
  }
  return project;
}

function persistedPublishedAt(
  context: ShopifyMetafieldProjectContext,
): Date | null {
  const raw = context.configuration?.fields.find(
    ({ catalogId }) => catalogId === 'listingpilot_system.published_at',
  )?.value;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function mapped(context: ShopifyMetafieldProjectContext) {
  return mapProjectToMetafields({
    projectId: context.projectId,
    ...context.projectData,
    lastPublishedAt: persistedPublishedAt(context),
  });
}

function safePreview(field: MappedMetafield | undefined): string | null {
  if (!field) return null;
  if (field.type === 'json') {
    const parsed = JSON.parse(field.value) as Record<string, unknown>;
    return `${Object.keys(parsed).length} structured specification field${
      Object.keys(parsed).length === 1 ? '' : 's'
    }`;
  }
  if (field.type === 'list.single_line_text_field') {
    const values = JSON.parse(field.value) as string[];
    return values.slice(0, 3).join(', ')
      + (values.length > 3 ? ` +${values.length - 3} more` : '');
  }
  return field.value.length > 180
    ? `${field.value.slice(0, 177)}…`
    : field.value;
}

export function buildMetafieldConfigurationDto(
  context: ShopifyMetafieldProjectContext,
  conflicts: DefinitionConflict[] = [],
): ShopifyMetafieldConfigurationDto {
  const byId = new Map(mapped(context).map((field) => [field.catalogId, field]));
  const persisted = new Map(
    context.configuration?.fields.map((field) => [field.catalogId, field]) ?? [],
  );
  return {
    schemaVersion: SHOPIFY_METAFIELD_CATALOG_VERSION,
    version: context.configuration?.version ?? 0,
    hasMappedData: [...byId.keys()].some(
      (id) => !id.startsWith('listingpilot_system.'),
    ),
    fields: SHOPIFY_METAFIELD_CATALOG.map((definition) => {
      const current = byId.get(definition.catalogId);
      const stored = persisted.get(definition.catalogId);
      const publicationStatus = !stored?.lastPublishedHash
        ? 'NOT_PUBLISHED'
        : stored.lastPublishedHash === current?.valueHash
          ? 'PUBLISHED'
          : 'CHANGED';
      return {
        catalogId: definition.catalogId,
        group: definition.group,
        displayName: definition.displayName,
        description: definition.description,
        type: definition.type,
        enabled: stored?.enabled ?? true,
        hasValue: Boolean(current),
        preview: safePreview(current),
        publicationStatus,
      };
    }),
    lastPublishedAt: context.configuration?.fields
      .flatMap(({ lastPublishedAt }) => lastPublishedAt ? [lastPublishedAt] : [])
      .sort((left, right) => right.valueOf() - left.valueOf())[0]
      ?.toISOString() ?? null,
    conflicts: conflicts.map((conflict) => ({
      ...conflict,
      displayName: getMetafieldCatalogDefinition(conflict.catalogId)
        ?.displayName ?? 'ListingPilot field',
    })),
  };
}

function fieldsForSave(
  context: ShopifyMetafieldProjectContext,
  choices: Map<string, boolean>,
) {
  const byId = new Map(mapped(context).map((field) => [field.catalogId, field]));
  return SHOPIFY_METAFIELD_CATALOG.map((definition) => {
    const value = byId.get(definition.catalogId);
    return {
      catalogId: definition.catalogId,
      namespace: definition.namespace,
      key: definition.key,
      type: definition.type,
      value: value?.value ?? null,
      valueHash: value?.valueHash ?? null,
      enabled: choices.get(definition.catalogId) ?? true,
    };
  });
}

async function refreshedContext(
  repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext,
) {
  return requireProject(await repository.resolveProject(
    context.actorUserId,
    context.projectId,
  ));
}

export async function getShopifyMetafieldConfiguration(
  _repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext | null,
) {
  return buildMetafieldConfigurationDto(requireProject(context));
}

export async function saveShopifyMetafieldConfiguration(
  repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext | null,
  untrustedInput: unknown,
) {
  const project = requireOwner(context);
  const input = metafieldConfigurationInputSchema.parse(untrustedInput);
  const choices = new Map(input.fields.map(
    ({ catalogId, enabled }) => [catalogId, enabled],
  ));
  for (const definition of SHOPIFY_METAFIELD_CATALOG) {
    if (definition.required && !choices.get(definition.catalogId)) {
      throw new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_VALIDATION_FAILED',
        'Required system metafields must remain enabled.',
        422,
      );
    }
  }
  if (!await repository.saveConfiguration({
    context: project,
    version: input.version,
    fields: fieldsForSave(project, choices),
  })) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_CONFIG_CONFLICT',
      'A newer metafield configuration exists. Refresh before saving.',
      409,
    );
  }
  return buildMetafieldConfigurationDto(
    await refreshedContext(repository, project),
  );
}

function localFields(
  context: ShopifyMetafieldProjectContext,
  currentMapping: MappedMetafield[],
): LocalMetafield[] {
  const byId = new Map(currentMapping.map((field) => [field.catalogId, field]));
  return (context.configuration?.fields ?? []).map((field) => {
    const current = byId.get(field.catalogId);
    return {
      localId: field.id,
      catalogId: field.catalogId,
      namespace: field.namespace,
      key: field.key,
      type: field.type,
      value: current?.value ?? null,
      valueHash: current?.valueHash ?? null,
      enabled: field.enabled,
      shopifyMetafieldId: field.shopifyMetafieldId,
    };
  });
}

async function ensureDefinition(
  shopify: ShopifyGraphqlMetafieldRepository,
  repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext,
  field: LocalMetafield,
): Promise<{
  definition: RemoteMetafieldDefinition | null;
  conflict: DefinitionConflict | null;
  created: boolean;
}> {
  const catalog = getMetafieldCatalogDefinition(field.catalogId);
  if (!catalog || !context.shopifyStoreId) {
    throw new Error('Approved catalog or connected store unavailable.');
  }
  let definition = await shopify.getDefinition(context.workspaceId, catalog);
  let created = false;
  if (!definition) {
    try {
      definition = await shopify.createDefinition(context.workspaceId, catalog);
      created = true;
    } catch (error) {
      if (!(error instanceof ShopifyMetafieldDefinitionRaceError)) throw error;
      definition = await shopify.getDefinition(context.workspaceId, catalog);
      if (!definition) throw error;
    }
  }
  if (definition.type !== field.type) {
    return {
      definition: null,
      conflict: {
        catalogId: field.catalogId,
        expectedType: field.type,
        existingType: definition.type,
      },
      created: false,
    };
  }
  await repository.persistDefinition({
    shopifyStoreId: context.shopifyStoreId,
    catalogId: field.catalogId,
    namespace: field.namespace,
    key: field.key,
    type: field.type,
    shopifyDefinitionId: definition.id,
  });
  return { definition, conflict: null, created };
}

async function audit(
  repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext,
  action: Parameters<ShopifyMetafieldRepository['createAudit']>[0]['action'],
  values: {
    catalogIds: string[];
    created: number;
    updated: number;
    unchanged: number;
    conflicted: number;
    batchCount: number;
    failureCategory?: string;
  },
) {
  await repository.createAudit({ context, action, metadata: values });
}

async function partial(
  repository: ShopifyMetafieldRepository,
  context: ShopifyMetafieldProjectContext,
  counts: Omit<ShopifyMetafieldPublishResult, 'outcome' | 'message' | 'configuration'>,
  conflicts: DefinitionConflict[],
  failureCategory: string,
): Promise<ShopifyMetafieldPublishResult> {
  try {
    await audit(repository, context, 'shopify.metafields_publish_partial', {
      catalogIds: conflicts.map(({ catalogId }) => catalogId),
      ...counts,
      failureCategory,
    });
  } catch {
    // The partial result remains honest if audit persistence also fails.
  }
  return {
    outcome: 'PARTIAL',
    ...counts,
    message: 'Some metafields completed, but publishing needs attention.',
    configuration: buildMetafieldConfigurationDto(
      await refreshedContext(repository, context),
      conflicts,
    ),
  };
}

export async function publishShopifyMetafields(
  dependencies: {
    repository: ShopifyMetafieldRepository;
    shopify: ShopifyGraphqlMetafieldRepository;
  },
  context: ShopifyMetafieldProjectContext | null,
): Promise<ShopifyMetafieldPublishResult> {
  let project = requireOwner(context);
  if (!project.shopifyStoreId) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_STORE_NOT_CONNECTED',
      'Connect Shopify before publishing metafields.',
      409,
    );
  }
  if (!project.shopifyProductId) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_PRODUCT_NOT_LINKED',
      'Publish the Shopify product before publishing metafields.',
      409,
    );
  }
  if (!project.configuration) {
    throw new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_CONFIGURATION_MISSING',
      'Save the metafield configuration before publishing.',
      409,
    );
  }
  const configurationId = project.configuration.id;
  const shopifyProductId = project.shopifyProductId;

  const currentMapping = mapped(project);
  await dependencies.repository.refreshMappedValues({
    configurationId,
    fields: SHOPIFY_METAFIELD_CATALOG.map((definition) => {
      const field = currentMapping.find(
        ({ catalogId }) => catalogId === definition.catalogId,
      );
      return {
        catalogId: definition.catalogId,
        value: field?.value ?? null,
        valueHash: field?.valueHash ?? null,
      };
    }),
  });
  project = await refreshedContext(dependencies.repository, project);
  const local = localFields(project, currentMapping);
  const conflicts: DefinitionConflict[] = [];
  const createdDefinitions: string[] = [];

  try {
    for (const field of local.filter(({ enabled, value }) => enabled && value)) {
      const result = await ensureDefinition(
        dependencies.shopify,
        dependencies.repository,
        project,
        field,
      );
      if (result.conflict) conflicts.push(result.conflict);
      if (result.created) createdDefinitions.push(field.catalogId);
    }
  } catch {
    return partial(dependencies.repository, project, {
      created: 0,
      updated: 0,
      unchanged: 0,
      conflicted: conflicts.length,
      batchCount: 0,
    }, conflicts, 'definition_reconciliation_failed');
  }

  if (createdDefinitions.length) {
    try {
      await audit(
        dependencies.repository,
        project,
        'shopify.metafield_definitions_created',
        {
          catalogIds: createdDefinitions,
          created: createdDefinitions.length,
          updated: 0,
          unchanged: 0,
          conflicted: conflicts.length,
          batchCount: 0,
        },
      );
    } catch {
      return partial(dependencies.repository, project, {
        created: 0,
        updated: 0,
        unchanged: 0,
        conflicted: conflicts.length,
        batchCount: 0,
      }, conflicts, 'definition_audit_failed');
    }
  }
  if (conflicts.length) {
    try {
      await audit(
        dependencies.repository,
        project,
        'shopify.metafield_definition_conflict',
        {
          catalogIds: conflicts.map(({ catalogId }) => catalogId),
          created: 0,
          updated: 0,
          unchanged: 0,
          conflicted: conflicts.length,
          batchCount: 0,
        },
      );
    } catch {
      // The safe conflict still appears in the result.
    }
  }

  let remote;
  try {
    remote = await dependencies.shopify.getCurrent(
      project.workspaceId,
      shopifyProductId,
    );
  } catch (error) {
    if (createdDefinitions.length || conflicts.length) {
      return partial(dependencies.repository, project, {
        created: 0,
        updated: 0,
        unchanged: 0,
        conflicted: conflicts.length,
        batchCount: 0,
      }, conflicts, 'remote_lookup_failed_after_definition_changes');
    }
    throw normalizeShopifyMetafieldError(error);
  }
  let plan = buildMetafieldSynchronizationPlan(local, remote, conflicts);

  if (plan.create.length || plan.update.length) {
    const publishedAt = new Date();
    const definition = getMetafieldCatalogDefinition(
      'listingpilot_system.published_at',
    );
    const existing = local.find(
      ({ catalogId }) => catalogId === definition?.catalogId,
    );
    if (definition && existing?.enabled) {
      const value = normalizeMetafieldValue(
        definition,
        publishedAt.toISOString(),
      );
      existing.value = value;
      existing.valueHash = metafieldValueHash(value);
      await dependencies.repository.refreshMappedValues({
        configurationId,
        fields: [{
          catalogId: existing.catalogId,
          value,
          valueHash: existing.valueHash,
        }],
      });
      if (!createdDefinitions.includes(existing.catalogId)) {
        const ensured = await ensureDefinition(
          dependencies.shopify,
          dependencies.repository,
          project,
          existing,
        );
        if (ensured.conflict) conflicts.push(ensured.conflict);
        if (ensured.created) {
          createdDefinitions.push(existing.catalogId);
          try {
            await audit(
              dependencies.repository,
              project,
              'shopify.metafield_definitions_created',
              {
                catalogIds: [existing.catalogId],
                created: 1,
                updated: 0,
                unchanged: 0,
                conflicted: conflicts.length,
                batchCount: 0,
              },
            );
          } catch {
            return partial(dependencies.repository, project, {
              created: 0,
              updated: 0,
              unchanged: plan.unchanged.length,
              conflicted: conflicts.length,
              batchCount: 0,
            }, conflicts, 'definition_audit_failed');
          }
        }
      }
      plan = buildMetafieldSynchronizationPlan(local, remote, conflicts);
    }
  }

  const operations = [
    ...plan.create.map(({ local: field }) => ({ field, mode: 'create' as const })),
    ...plan.update.map(({ local: field }) => ({ field, mode: 'update' as const })),
  ];
  const batches = deterministicMetafieldBatches(
    operations.map((operation) => ({
      ...operation,
      catalogId: operation.field.catalogId,
    })),
  );
  const counts = {
    created: 0,
    updated: 0,
    unchanged: plan.unchanged.length,
    conflicted: conflicts.length,
    batchCount: 0,
  };

  const recovered = plan.unchanged.filter(({ local: field, remote: current }) => (
    field.shopifyMetafieldId !== current.id
  ));
  if (recovered.length) {
    try {
      await dependencies.repository.persistPublished({
        configurationId,
        publishedAt: new Date(),
        fields: recovered.map(({ local: field, remote: current }) => ({
          catalogId: field.catalogId,
          shopifyMetafieldId: current.id,
          valueHash: field.valueHash!,
        })),
      });
    } catch {
      return partial(
        dependencies.repository,
        project,
        counts,
        conflicts,
        'reconciliation_persistence_failed',
      );
    }
  }

  for (const batch of batches) {
    let shopifyBatchAccepted = false;
    try {
      const input: MetafieldSetInput[] = batch.map(({ field }) => {
        const current = remote.find(({ namespace, key }) => (
          namespace === field.namespace && key === field.key
        ));
        return {
          catalogId: field.catalogId,
          namespace: field.namespace,
          key: field.key,
          type: field.type,
          value: field.value!,
          compareDigest: current?.compareDigest ?? null,
        };
      });
      const published = await dependencies.shopify.setMetafields(
        project.workspaceId,
        shopifyProductId,
        input,
      );
      shopifyBatchAccepted = true;
      await dependencies.repository.persistPublished({
        configurationId,
        publishedAt: new Date(),
        fields: batch.map(({ field }) => {
          const current = published.find(({ namespace, key }) => (
            namespace === field.namespace && key === field.key
          ));
          if (!current) {
            throw new ShopifyMetafieldError(
              'SHOPIFY_METAFIELD_INVALID_RESPONSE',
              'Shopify returned an invalid metafield response.',
              502,
            );
          }
          return {
            catalogId: field.catalogId,
            shopifyMetafieldId: current.id,
            valueHash: field.valueHash!,
          };
        }),
      });
      counts.batchCount += 1;
      counts.created += batch.filter(({ mode }) => mode === 'create').length;
      counts.updated += batch.filter(({ mode }) => mode === 'update').length;
    } catch (error) {
      if (shopifyBatchAccepted || counts.batchCount || conflicts.length) {
        return partial(
          dependencies.repository,
          project,
          counts,
          conflicts,
          'shopify_or_persistence_failure',
        );
      }
      throw normalizeShopifyMetafieldError(error);
    }
  }

  const outcome = conflicts.length
    ? 'PARTIAL'
    : counts.created || counts.updated
      ? 'PUBLISHED'
      : 'UNCHANGED';
  const action = counts.created
    ? 'shopify.metafields_created'
    : counts.updated
      ? 'shopify.metafields_updated'
      : 'shopify.metafields_publish_unchanged';
  try {
    await audit(dependencies.repository, project, action, {
      catalogIds: operations.map(({ field }) => field.catalogId),
      ...counts,
    });
  } catch {
    if (counts.created || counts.updated) {
      return partial(
        dependencies.repository,
        project,
        counts,
        conflicts,
        'audit_persistence_failed',
      );
    }
  }
  return {
    outcome,
    ...counts,
    message: outcome === 'UNCHANGED'
      ? 'No Shopify metafield changes were required.'
      : outcome === 'PARTIAL'
        ? 'Compatible metafields were published; definition conflicts need review.'
        : 'Shopify metafields were published successfully.',
    configuration: buildMetafieldConfigurationDto(
      await refreshedContext(dependencies.repository, project),
      conflicts,
    ),
  };
}
