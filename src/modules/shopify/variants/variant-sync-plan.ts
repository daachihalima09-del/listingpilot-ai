import {
  buildVariantCombinationKey,
  compareDecimalStrings,
} from './variant-validation.ts';
import type {
  RemoteShopifyProductVariants,
  RemoteShopifyVariant,
  ShopifyVariantMutationInput,
} from './graphql-variant-repository.ts';
import type {
  PersistedShopifyVariant,
  PersistedShopifyVariantConfiguration,
} from './variant-repository.ts';

export interface PlannedVariant {
  local: PersistedShopifyVariant;
  remote?: RemoteShopifyVariant;
  mutation: ShopifyVariantMutationInput;
  recoveredLink?: boolean;
}

export interface ShopifyVariantSynchronizationPlan {
  create: PlannedVariant[];
  update: PlannedVariant[];
  unchanged: PlannedVariant[];
  missingRemotely: PersistedShopifyVariant[];
  missingLocally: Array<{
    remote: RemoteShopifyVariant;
    managed: boolean;
  }>;
  recoveredLinks: Array<{
    localVariantId: string;
    shopifyVariantId: string;
  }>;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function sameNullable(left: string | null, right: string | null): boolean {
  return (left || null) === (right || null);
}

function sameVariant(
  local: PersistedShopifyVariant,
  remote: RemoteShopifyVariant,
): boolean {
  return compareDecimalStrings(local.price, remote.price) === 0
    && (
      local.compareAtPrice === null
        ? remote.compareAtPrice === null
        : remote.compareAtPrice !== null
          && compareDecimalStrings(
            local.compareAtPrice,
            remote.compareAtPrice,
          ) === 0
    )
    && sameNullable(local.sku, remote.sku)
    && sameNullable(local.barcode, remote.barcode);
}

function mutation(
  local: PersistedShopifyVariant,
  shopifyVariantId?: string,
  includeOptionValues = false,
): ShopifyVariantMutationInput {
  return {
    localVariantId: local.id,
    ...(includeOptionValues ? { optionValues: local.optionValues } : {}),
    price: local.price,
    compareAtPrice: local.compareAtPrice,
    sku: local.sku,
    barcode: local.barcode,
    ...(shopifyVariantId ? { shopifyVariantId } : {}),
  };
}

export function buildShopifyVariantSynchronizationPlan(
  configuration: PersistedShopifyVariantConfiguration,
  remote: RemoteShopifyProductVariants,
): ShopifyVariantSynchronizationPlan {
  const plan: ShopifyVariantSynchronizationPlan = {
    create: [],
    update: [],
    unchanged: [],
    missingRemotely: [],
    missingLocally: [],
    recoveredLinks: [],
  };
  const active = configuration.variants
    .filter(({ active: isActive }) => isActive)
    .sort((left, right) => left.position - right.position);
  const remoteById = new Map(remote.variants.map((variant) => [
    variant.id,
    variant,
  ]));
  const linkedIds = new Set(
    configuration.variants
      .map(({ shopifyVariantId }) => shopifyVariantId)
      .filter((id): id is string => Boolean(id)),
  );
  const matchedRemoteIds = new Set<string>();
  const defaultVariant = remote.hasOnlyDefaultVariant
    ? remote.variants[0]
    : undefined;

  for (const [index, local] of active.entries()) {
    let remoteVariant = local.shopifyVariantId
      ? remoteById.get(local.shopifyVariantId)
      : undefined;
    let recoveredLink = false;
    let includeOptionValues = false;

    if (local.shopifyVariantId && !remoteVariant) {
      plan.missingRemotely.push(local);
      continue;
    }

    if (!local.shopifyVariantId && index === 0 && defaultVariant) {
      remoteVariant = defaultVariant;
      recoveredLink = true;
      includeOptionValues = configuration.options.length > 0;
    }

    if (!local.shopifyVariantId && !remoteVariant) {
      const combination = local.combinationKey;
      const candidates = remote.variants.filter((candidate) => (
        !linkedIds.has(candidate.id)
        && !matchedRemoteIds.has(candidate.id)
        && buildVariantCombinationKey(candidate.optionValues) === combination
      ));
      if (candidates.length === 1) {
        [remoteVariant] = candidates;
        recoveredLink = true;
      }
    }

    if (!remoteVariant) {
      plan.create.push({
        local,
        mutation: mutation(local, undefined, true),
      });
      continue;
    }

    matchedRemoteIds.add(remoteVariant.id);
    if (recoveredLink) {
      plan.recoveredLinks.push({
        localVariantId: local.id,
        shopifyVariantId: remoteVariant.id,
      });
    }
    const planned = {
      local,
      remote: remoteVariant,
      mutation: mutation(local, remoteVariant.id, includeOptionValues),
      recoveredLink,
    };
    if (sameVariant(local, remoteVariant) && !includeOptionValues) {
      plan.unchanged.push(planned);
    } else {
      plan.update.push(planned);
    }
  }

  const activeLinkedIds = new Set(
    active
      .map(({ shopifyVariantId }) => shopifyVariantId)
      .filter((id): id is string => Boolean(id)),
  );
  for (const remoteVariant of remote.variants) {
    if (!matchedRemoteIds.has(remoteVariant.id)) {
      plan.missingLocally.push({
        remote: remoteVariant,
        managed: linkedIds.has(remoteVariant.id)
          && !activeLinkedIds.has(remoteVariant.id),
      });
    }
  }
  return plan;
}

export function missingShopifyOptions(
  local: Array<{ name: string; values: string[] }>,
  remote: RemoteShopifyProductVariants,
): Array<{ name: string; values: string[] }> {
  if (local.length === 0) return [];
  const remoteNames = new Set(
    (remote.hasOnlyDefaultVariant ? [] : remote.options)
      .map(({ name }) => normalized(name)),
  );
  return local.filter(({ name }) => !remoteNames.has(normalized(name)));
}
