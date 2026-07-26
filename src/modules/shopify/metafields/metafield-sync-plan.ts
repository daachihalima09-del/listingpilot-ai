import {
  SHOPIFY_METAFIELDS_SET_BATCH_SIZE,
  type ShopifyMetafieldType,
} from './metafield-catalog.ts';
import { metafieldValueHash } from './metafield-mapping.ts';

export interface LocalMetafield {
  localId: string;
  catalogId: string;
  namespace: string;
  key: string;
  type: ShopifyMetafieldType;
  value: string | null;
  valueHash: string | null;
  enabled: boolean;
  shopifyMetafieldId: string | null;
}

export interface RemoteMetafield {
  id: string;
  namespace: string;
  key: string;
  type: string;
  value: string;
  compareDigest: string;
}

export interface DefinitionConflict {
  catalogId: string;
  expectedType: string;
  existingType: string;
}

export function buildMetafieldSynchronizationPlan(
  local: LocalMetafield[],
  remote: RemoteMetafield[],
  conflicts: DefinitionConflict[] = [],
) {
  const remoteByIdentity = new Map(
    remote.map((field) => [`${field.namespace}.${field.key}`, field]),
  );
  const conflictById = new Map(conflicts.map((item) => [item.catalogId, item]));
  const plan = {
    create: [] as Array<{ local: LocalMetafield; remote: null }>,
    update: [] as Array<{ local: LocalMetafield; remote: RemoteMetafield }>,
    unchanged: [] as Array<{ local: LocalMetafield; remote: RemoteMetafield }>,
    disabled: [] as LocalMetafield[],
    emptyOmitted: [] as LocalMetafield[],
    missingRemotely: [] as LocalMetafield[],
    definitionConflicts: [] as DefinitionConflict[],
    invalidLocal: [] as LocalMetafield[],
  };
  for (const field of [...local].sort(
    (left, right) => left.catalogId.localeCompare(right.catalogId),
  )) {
    if (!field.enabled) {
      plan.disabled.push(field);
      continue;
    }
    if (!field.value || !field.valueHash) {
      plan.emptyOmitted.push(field);
      continue;
    }
    const conflict = conflictById.get(field.catalogId);
    if (conflict) {
      plan.definitionConflicts.push(conflict);
      continue;
    }
    const identity = `${field.namespace}.${field.key}`;
    const current = remoteByIdentity.get(identity);
    if (!current) {
      if (field.shopifyMetafieldId) plan.missingRemotely.push(field);
      plan.create.push({ local: field, remote: null });
      continue;
    }
    if (current.type !== field.type) {
      plan.invalidLocal.push(field);
      continue;
    }
    if (
      metafieldValueHash(current.value) === field.valueHash
      && current.value === field.value
    ) {
      plan.unchanged.push({ local: field, remote: current });
    } else {
      plan.update.push({ local: field, remote: current });
    }
  }
  return plan;
}

export function deterministicMetafieldBatches<T extends {
  catalogId: string;
}>(items: T[], batchSize = SHOPIFY_METAFIELDS_SET_BATCH_SIZE): T[][] {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('Batch size must be a positive integer.');
  }
  const ordered = [...items].sort(
    (left, right) => left.catalogId.localeCompare(right.catalogId),
  );
  const batches: T[][] = [];
  for (let index = 0; index < ordered.length; index += batchSize) {
    batches.push(ordered.slice(index, index + batchSize));
  }
  return batches;
}
