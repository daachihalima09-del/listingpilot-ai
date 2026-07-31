import type { NormalizedProduct } from '../domain/types.ts';
import type {
  CatalogHealthConfiguration,
  CatalogHealthSegmentPolicy,
} from './configuration.ts';
import { percentageOf } from './grade.ts';
import type {
  CatalogSegmentType,
  ProblemConcentration,
} from './types.ts';

export interface ProductSegmentValue {
  readonly type: CatalogSegmentType;
  readonly key: string;
  readonly label: string;
}

function primitiveLabel(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

export function segmentValuesForProduct(
  product: NormalizedProduct,
  policy: CatalogHealthSegmentPolicy,
): readonly ProductSegmentValue[] {
  let values: readonly string[] = [];
  if (policy.type === 'VENDOR') values = product.vendor ? [product.vendor] : [];
  else if (policy.type === 'PRODUCT_TYPE') values = product.productType ? [product.productType] : [];
  else if (policy.type === 'CATEGORY') values = product.categories;
  else if (policy.type === 'STATUS') values = product.status ? [product.status] : [];
  else if (policy.type === 'SOURCE') {
    values = product.sourceReferences.map(({ sourceType }) => sourceType);
  } else if (policy.type === 'METADATA') {
    const key = policy.metadataKey!;
    const value = product.attributes[key] ?? product.extensions[key];
    const label = primitiveLabel(value);
    values = label ? [label] : [];
  }
  const normalized = [...new Set(values
    .map((value) => value.trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .filter((value) => !policy.excludedKeys.includes(value));
  if (normalized.length === 0 && policy.includeMissing) {
    return [{ type: policy.type, key: '__missing__', label: 'Unspecified' }];
  }
  return normalized.map((label) => ({
    type: policy.type,
    key: label.toLocaleLowerCase(),
    label,
  }));
}

export function analyzeProblemConcentration(input: {
  readonly affectedProductIds: ReadonlySet<string>;
  readonly products: readonly NormalizedProduct[];
  readonly configuration: CatalogHealthConfiguration;
}): ProblemConcentration {
  const affectedPercentage = percentageOf(
    input.affectedProductIds.size,
    input.products.length,
  );
  if (affectedPercentage >= input.configuration.concentrationThresholds
    .catalogWideAffectedPercentage) {
    return Object.freeze({
      kind: 'CATALOG_WIDE',
      affectedProductShare: affectedPercentage,
      explanation: `${affectedPercentage}% of catalog products are affected.`,
    });
  }
  if (input.affectedProductIds.size <= input.configuration.concentrationThresholds
    .isolatedMaximumProducts) {
    return Object.freeze({
      kind: 'ISOLATED',
      affectedProductShare: affectedPercentage,
      explanation: `The problem is limited to ${input.affectedProductIds.size} product(s).`,
    });
  }
  const membershipCounts = new Map<string, {
    type: CatalogSegmentType;
    key: string;
    label: string;
    count: number;
  }>();
  const products = [...input.products].sort((left, right) => left.id.localeCompare(right.id));
  for (const product of products) {
    if (!input.affectedProductIds.has(product.id)) continue;
    for (const policy of input.configuration.segmentPolicies) {
      for (const segment of segmentValuesForProduct(product, policy)) {
        const identity = `${segment.type}:${segment.key}`;
        const current = membershipCounts.get(identity);
        if (current) current.count += 1;
        else membershipCounts.set(identity, { ...segment, count: 1 });
      }
    }
  }
  const concentrated = [...membershipCounts.values()]
    .map((value) => ({
      ...value,
      share: percentageOf(value.count, input.affectedProductIds.size),
    }))
    .filter(({ share }) => (
      share >= input.configuration.concentrationThresholds.segmentAffectedSharePercentage
    ))
    .sort((left, right) => (
      right.share - left.share
      || left.type.localeCompare(right.type)
      || left.key.localeCompare(right.key)
    ))[0];
  if (concentrated) {
    return Object.freeze({
      kind: 'SEGMENT_CONCENTRATED',
      segmentType: concentrated.type,
      segmentKey: concentrated.key,
      segmentLabel: concentrated.label,
      affectedProductShare: concentrated.share,
      explanation: `${concentrated.share}% of affected products are distributed in ${concentrated.label}.`,
    });
  }
  return Object.freeze({
    kind: 'DISTRIBUTED',
    affectedProductShare: affectedPercentage,
    explanation: 'Affected products are distributed without meeting a configured concentration threshold.',
  });
}
