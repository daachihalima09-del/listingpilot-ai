import type { ShopifyProductSnapshot } from '../catalog/snapshot.ts';
import { buildReviewField } from './three-way-comparison.ts';
import {
  comparableSnapshot,
  type ComparableValues,
} from './review-normalization.ts';
import type { ShopifyChangeReviewPayload } from './review-types.ts';

function localComparable(
  baseline: ShopifyProductSnapshot,
  project: {
    generatedListing: unknown;
    seoData: unknown;
    shopifyVariantConfiguration?: {
      variants: Array<{
        id: string;
        shopifyVariantId: string | null;
        optionValues: unknown;
        price: string;
        compareAtPrice: string | null;
        sku: string | null;
        barcode: string | null;
        position: number;
        active: boolean;
      }>;
    } | null;
    shopifyMetafieldConfiguration?: {
      metafields: Array<{
        namespace: string;
        key: string;
        type: string;
        serializedValue: string | null;
        enabled: boolean;
      }>;
    } | null;
    shopifyImageConfiguration?: {
      images: Array<{
        id: string;
        shopifyMediaId: string | null;
        altText: string | null;
        position: number;
        active: boolean;
      }>;
    } | null;
  },
): ComparableValues {
  const values = comparableSnapshot(baseline);
  if (project.generatedListing && typeof project.generatedListing === 'object') {
    const listing = project.generatedListing as Record<string, unknown>;
    if (typeof listing.title === 'string') values.get('product.title')!.value = listing.title;
    if (typeof listing.description === 'string') {
      values.get('product.descriptionHtml')!.value = listing.description.replace(/\r\n?/g, '\n');
    }
  }
  if (project.seoData && typeof project.seoData === 'object') {
    const seo = project.seoData as Record<string, unknown>;
    if (typeof seo.seoTitle === 'string') values.get('product.seo.title')!.value = seo.seoTitle;
    if (typeof seo.seoDescription === 'string') values.get('product.seo.description')!.value = seo.seoDescription;
    if (typeof seo.tags === 'string') {
      const tags = [...new Set(seo.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))].sort();
      values.get('product.tags')!.value = tags;
    }
  }
  for (const variant of project.shopifyVariantConfiguration?.variants ?? []) {
    const baselineVariant = variant.shopifyVariantId
      ? baseline.product.variants.find(({ legacyResourceId }) => legacyResourceId === variant.shopifyVariantId)
      : undefined;
    if (!baselineVariant) {
      values.set(`variants.local:${variant.id}.identity`, {
        label: 'New local variant',
        resourceType: 'VARIANT',
        resourceId: null,
        value: variant.active ? variant.optionValues : undefined,
        publishable: false,
        blocked: true,
        warningCodes: ['MISSING_SHOPIFY_VARIANT_ID'],
      });
      continue;
    }
    const prefix = `variants.${baselineVariant.id}`;
    if (!variant.active) {
      for (const key of ['title', 'sku', 'barcode', 'price', 'compareAtPrice', 'selectedOptions', 'position']) {
        values.delete(`${prefix}.${key}`);
      }
      continue;
    }
    values.get(`${prefix}.sku`)!.value = variant.sku ?? '';
    values.get(`${prefix}.barcode`)!.value = variant.barcode ?? '';
    values.get(`${prefix}.price`)!.value = variant.price;
    values.get(`${prefix}.compareAtPrice`)!.value = variant.compareAtPrice;
    values.get(`${prefix}.selectedOptions`)!.value = variant.optionValues;
    values.get(`${prefix}.position`)!.value = variant.position;
  }
  for (const metafield of project.shopifyMetafieldConfiguration?.metafields ?? []) {
    if (!metafield.enabled || metafield.serializedValue === null) continue;
    const path = `metafields.${metafield.namespace}.${metafield.key}`;
    const existing = values.get(path);
    values.set(path, {
      label: `${metafield.namespace}.${metafield.key}`,
      resourceType: 'METAFIELD',
      resourceId: existing?.resourceId ?? null,
      value: { type: metafield.type, value: metafield.serializedValue },
      publishable: true,
    });
  }
  for (const image of project.shopifyImageConfiguration?.images ?? []) {
    const baselineMedia = image.shopifyMediaId
      ? baseline.product.media.find(({ id }) => id.endsWith(`/${image.shopifyMediaId}`))
      : undefined;
    if (!baselineMedia) {
      values.set(`media.local:${image.id}.identity`, {
        label: 'New local image',
        resourceType: 'MEDIA',
        resourceId: null,
        value: image.active ? { position: image.position } : undefined,
        publishable: false,
        blocked: true,
        warningCodes: ['MEDIA_UPLOAD'],
      });
      continue;
    }
    if (!image.active) {
      values.delete(`media.${baselineMedia.id}.alt`);
      values.delete(`media.${baselineMedia.id}.identity`);
      continue;
    }
    values.get(`media.${baselineMedia.id}.alt`)!.value = image.altText;
  }
  return values;
}

export function generateShopifyChangeReview(input: {
  projectId: string;
  workspaceId: string;
  shopifyStoreId: string;
  baseline: ShopifyProductSnapshot;
  remote: ShopifyProductSnapshot;
  project: Parameters<typeof localComparable>[1];
  generatedAt?: Date;
}): ShopifyChangeReviewPayload {
  const baseline = comparableSnapshot(input.baseline);
  const local = localComparable(input.baseline, input.project);
  const remote = comparableSnapshot(input.remote);
  const paths = [...new Set([
    ...baseline.keys(),
    ...local.keys(),
    ...remote.keys(),
  ])].sort();
  const fields = paths.map((fieldPath) => {
    const definition = local.get(fieldPath)
      ?? remote.get(fieldPath)
      ?? baseline.get(fieldPath)!;
    const field = buildReviewField({
      fieldPath,
      label: definition.label,
      resourceType: definition.resourceType,
      resourceId: definition.resourceId,
      baselineValue: baseline.get(fieldPath)?.value,
      localValue: local.get(fieldPath)?.value,
      remoteValue: remote.get(fieldPath)?.value,
      publishable: definition.publishable,
      blocked: definition.blocked,
      warningCodes: definition.warningCodes,
    });
    if (
      ['LOCAL_REMOVED', 'REMOTE_REMOVED'].includes(field.classification)
      && field.resourceType !== 'PRODUCT'
    ) {
      return {
        ...field,
        classification: 'BLOCKED' as const,
        publishable: false,
        defaultDecision: 'SKIP' as const,
        availableDecisions: ['SKIP' as const],
        blockerCodes: ['DESTRUCTIVE_CHANGE_UNSUPPORTED'],
      };
    }
    return field;
  });
  const changed = fields.filter(({ classification }) => classification !== 'UNCHANGED');
  return {
    schemaVersion: '1',
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    shopifyStoreId: input.shopifyStoreId,
    shopifyProductGid: input.baseline.product.id,
    baselineShopifyUpdatedAt: input.baseline.product.updatedAt,
    remoteShopifyUpdatedAt: input.remote.product.updatedAt,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    summary: {
      totalChanges: changed.length,
      localChanges: changed.filter(({ classification }) => classification.startsWith('LOCAL')).length,
      remoteChanges: changed.filter(({ classification }) => classification.startsWith('REMOTE')).length,
      conflicts: changed.filter(({ classification }) => classification === 'CONFLICT').length,
      blocked: changed.filter(({ classification }) => classification === 'BLOCKED').length,
    },
    fields,
    blockers: fields.filter(({ classification }) => classification === 'BLOCKED').map(({ fieldPath }) => fieldPath),
    warnings: [...new Set(fields.flatMap(({ warningCodes }) => warningCodes))],
  };
}
