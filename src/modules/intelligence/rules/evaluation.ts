import type {
  IntelligenceContext,
  IntelligenceIssue,
  NormalizedProduct,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { DetectorMetadata } from '../detectors/contract.ts';
import type { DeterministicRuleConfiguration } from './configuration.ts';
import { compareExactDecimals, parseExactDecimal } from './decimal.ts';
import { createRuleIssue, type RuleIssueTarget } from './issue-factory.ts';
import {
  descriptionText,
  isBlank,
  normalizeConfiguredText,
  normalizeDescription,
  normalizeMediaUrl,
  normalizeSpecificationIdentity,
} from './normalization.ts';
import type { IntelligenceRuleDefinition } from './registry.ts';

export type RuleMap = ReadonlyMap<string, IntelligenceRuleDefinition>;

interface EvaluationInput {
  readonly context: IntelligenceContext;
  readonly configuration: DeterministicRuleConfiguration;
  readonly rules: RuleMap;
  readonly detector: DetectorMetadata;
  readonly hasher: IntelligenceHasher;
}

function issue(input: EvaluationInput, ruleId: string, target: RuleIssueTarget): IntelligenceIssue[] {
  const rule = input.rules.get(ruleId);
  if (!rule) return [];
  return [createRuleIssue({
    rule,
    detector: input.detector,
    context: input.context,
    target,
    hasher: input.hasher,
  })];
}

function groupBy<T>(items: Iterable<T>, key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const normalized = key(item);
    const group = groups.get(normalized) ?? [];
    group.push(item);
    groups.set(normalized, group);
  }
  return groups;
}

export function evaluateProductIdentityRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  for (const product of input.context.products) {
    if (isBlank(product.title)) issues.push(...issue(input, 'product.title.missing', { affectedProductIds: [product.id], affectedFields: ['title'] }));
    if (isBlank(product.vendor)) issues.push(...issue(input, 'product.vendor.missing', { affectedProductIds: [product.id], affectedFields: ['vendor'] }));
    if (isBlank(product.productType)) issues.push(...issue(input, 'product.type.missing', { affectedProductIds: [product.id], affectedFields: ['productType'] }));
    if (isBlank(product.seo.handle)) issues.push(...issue(input, 'product.handle.missing', { affectedProductIds: [product.id], affectedFields: ['seo.handle'] }));
    if (isBlank(product.status)) issues.push(...issue(input, 'product.status.missing', { affectedProductIds: [product.id], affectedFields: ['status'] }));
  }
  return issues;
}

export function evaluateDescriptionRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  const comparable: Array<{ product: NormalizedProduct; value: string }> = [];
  for (const product of input.context.products) {
    if (product.description === undefined || product.description === null) {
      issues.push(...issue(input, 'product.description.missing', {
        affectedProductIds: [product.id],
        affectedFields: ['description'],
      }));
      continue;
    }
    const text = descriptionText(product.description);
    if (!text) {
      issues.push(...issue(input, 'product.description.empty', {
        affectedProductIds: [product.id],
        affectedFields: ['description'],
      }));
      continue;
    }
    if (text.length < input.configuration.description.minimumLength) {
      issues.push(...issue(input, 'product.description.too_short', {
        affectedProductIds: [product.id],
        affectedFields: ['description'],
        metadata: {
          actualLength: text.length,
          minimumLength: input.configuration.description.minimumLength,
        },
      }));
    }
    comparable.push({
      product,
      value: normalizeDescription(product.description, input.configuration.description.duplicateComparisonMode),
    });
  }
  if (input.configuration.catalog.enableCrossProductChecks) {
    for (const [value, group] of groupBy(comparable, ({ value: item }) => item)) {
      if ((!value && !input.configuration.duplicateDetection.compareEmptyValues) || group.length < 2) continue;
      issues.push(...issue(input, 'product.description.duplicate', {
        affectedProductIds: group.map(({ product }) => product.id),
        affectedFields: ['description'],
        scope: 'CATALOG',
        metadata: { duplicateCount: group.length },
      }));
    }
  }
  return issues;
}

interface VariantEntry {
  readonly productId: string;
  readonly variantId: string;
  readonly index: number;
  readonly value: string;
}

function duplicateVariantFieldIssues(
  input: EvaluationInput,
  ruleId: string,
  entries: readonly VariantEntry[],
  field: 'sku' | 'barcode',
): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  const groups = groupBy(entries, (entry) => (
    input.configuration.catalog.enableCrossProductChecks
      ? entry.value
      : `${entry.productId}\u0000${entry.value}`
  ));
  for (const [value, group] of groups) {
    if ((!value && !input.configuration.duplicateDetection.compareEmptyValues) || group.length < 2) continue;
    issues.push(...issue(input, ruleId, {
      affectedProductIds: group.map(({ productId }) => productId),
      affectedVariantIds: group.map(({ variantId }) => variantId),
      affectedFields: group.map(({ index }) => `variants.${index}.${field}`),
      scope: group.some(({ productId }) => productId !== group[0].productId) ? 'CATALOG' : 'VARIANT',
      metadata: { duplicateCount: group.length },
    }));
  }
  return issues;
}

export function evaluateVariantRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  const skuEntries: VariantEntry[] = [];
  const barcodeEntries: VariantEntry[] = [];
  const idEntries: VariantEntry[] = [];
  for (const product of input.context.products) {
    if (product.variants.length === 0) {
      issues.push(...issue(input, 'product.variants.missing', {
        affectedProductIds: [product.id],
        affectedFields: ['variants'],
        scope: 'PRODUCT',
      }));
    }
    product.variants.forEach((variant, index) => {
      const prefix = `variants.${index}`;
      if (isBlank(variant.sku)) {
        issues.push(...issue(input, 'variant.sku.missing', {
          affectedProductIds: [product.id],
          affectedVariantIds: [variant.id],
          affectedFields: [`${prefix}.sku`],
          scope: 'VARIANT',
        }));
      } else {
        skuEntries.push({
          productId: product.id,
          variantId: variant.id,
          index,
          value: normalizeConfiguredText(variant.sku, input.configuration),
        });
      }
      if (!isBlank(variant.barcode)) {
        barcodeEntries.push({
          productId: product.id,
          variantId: variant.id,
          index,
          value: normalizeConfiguredText(variant.barcode, input.configuration),
        });
      }
      idEntries.push({ productId: product.id, variantId: variant.id, index, value: variant.id });
      for (const [name, value] of Object.entries(variant.options)) {
        if (isBlank(name)) {
          issues.push(...issue(input, 'variant.option.name.empty', {
            affectedProductIds: [product.id],
            affectedVariantIds: [variant.id],
            affectedFields: [`${prefix}.options`],
            scope: 'VARIANT',
          }));
        }
        if (isBlank(value)) {
          issues.push(...issue(input, 'variant.option.value.empty', {
            affectedProductIds: [product.id],
            affectedVariantIds: [variant.id],
            affectedFields: [`${prefix}.options.${name || '<empty>'}`],
            scope: 'VARIANT',
          }));
        }
      }
      if (isBlank(variant.price)) {
        issues.push(...issue(input, 'variant.price.missing', {
          affectedProductIds: [product.id],
          affectedVariantIds: [variant.id],
          affectedFields: [`${prefix}.price`],
          scope: 'VARIANT',
        }));
      } else {
        const price = parseExactDecimal(variant.price);
        if (!price) {
          issues.push(...issue(input, 'variant.price.invalid', {
            affectedProductIds: [product.id],
            affectedVariantIds: [variant.id],
            affectedFields: [`${prefix}.price`],
            scope: 'VARIANT',
          }));
        } else if (price.negative && price.digits !== BigInt(0)) {
          issues.push(...issue(input, 'variant.price.negative', {
            affectedProductIds: [product.id],
            affectedVariantIds: [variant.id],
            affectedFields: [`${prefix}.price`],
            scope: 'VARIANT',
          }));
        }
        if (!isBlank(variant.compareAtPrice)) {
          const compareAt = parseExactDecimal(variant.compareAtPrice);
          if (!compareAt) {
            issues.push(...issue(input, 'variant.compare_at.invalid', {
              affectedProductIds: [product.id],
              affectedVariantIds: [variant.id],
              affectedFields: [`${prefix}.compareAtPrice`],
              scope: 'VARIANT',
            }));
          } else if (compareAt.negative && compareAt.digits !== BigInt(0)) {
            issues.push(...issue(input, 'variant.compare_at.negative', {
              affectedProductIds: [product.id],
              affectedVariantIds: [variant.id],
              affectedFields: [`${prefix}.compareAtPrice`],
              scope: 'VARIANT',
            }));
          } else if (price) {
            const comparison = compareExactDecimals(compareAt, price);
            if (comparison < 0) {
              issues.push(...issue(input, 'variant.compare_at.below_price', {
                affectedProductIds: [product.id],
                affectedVariantIds: [variant.id],
                affectedFields: [`${prefix}.compareAtPrice`, `${prefix}.price`],
                scope: 'VARIANT',
              }));
            } else if (comparison === 0) {
              issues.push(...issue(input, 'variant.compare_at.equal_price', {
                affectedProductIds: [product.id],
                affectedVariantIds: [variant.id],
                affectedFields: [`${prefix}.compareAtPrice`, `${prefix}.price`],
                scope: 'VARIANT',
              }));
            }
          }
        }
      }
    });
  }
  issues.push(...duplicateVariantFieldIssues(input, 'variant.sku.duplicate', skuEntries, 'sku'));
  issues.push(...duplicateVariantFieldIssues(input, 'variant.barcode.duplicate', barcodeEntries, 'barcode'));
  for (const [, group] of groupBy(idEntries, ({ value }) => value)) {
    if (group.length < 2) continue;
    issues.push(...issue(input, 'variant.id.duplicate', {
      affectedProductIds: group.map(({ productId }) => productId),
      affectedVariantIds: group.map(({ variantId }) => variantId),
      affectedFields: group.map(({ index }) => `variants.${index}.id`),
      scope: group.some(({ productId }) => productId !== group[0].productId) ? 'CATALOG' : 'VARIANT',
      metadata: { duplicateCount: group.length },
    }));
  }
  return issues;
}

interface MediaEntry {
  readonly productId: string;
  readonly mediaId: string;
  readonly index: number;
  readonly value: string;
}

export function evaluateMediaRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  const urls: MediaEntry[] = [];
  for (const product of input.context.products) {
    if (product.media.length === 0) {
      issues.push(...issue(input, 'product.media.missing', {
        affectedProductIds: [product.id],
        affectedFields: ['media'],
        scope: 'PRODUCT',
      }));
    }
    const positions = new Map<number, MediaEntry[]>();
    product.media.forEach((media, index) => {
      const prefix = `media.${index}`;
      if (
        media.type === 'IMAGE'
        && input.configuration.media.requireAltTextForImages
        && isBlank(media.altText)
      ) {
        issues.push(...issue(input, 'media.image.alt.missing', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.altText`],
          metadata: { mediaId: media.id },
        }));
      }
      const url = normalizeMediaUrl(media.url, input.configuration.duplicateDetection.mediaUrlNormalization);
      if (url) urls.push({ productId: product.id, mediaId: media.id, index, value: url });
      const validPosition = Number.isInteger(media.position) && media.position >= 0;
      if (!validPosition) {
        issues.push(...issue(input, 'media.position.invalid', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.position`],
          metadata: { mediaId: media.id },
        }));
      } else {
        const group = positions.get(media.position) ?? [];
        group.push({ productId: product.id, mediaId: media.id, index, value: String(media.position) });
        positions.set(media.position, group);
      }
      const widthPresent = media.width !== undefined;
      const heightPresent = media.height !== undefined;
      if (widthPresent && (!Number.isInteger(media.width) || media.width! <= 0)) {
        issues.push(...issue(input, 'media.width.invalid', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.width`],
          metadata: { mediaId: media.id },
        }));
      }
      if (heightPresent && (!Number.isInteger(media.height) || media.height! <= 0)) {
        issues.push(...issue(input, 'media.height.invalid', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.height`],
          metadata: { mediaId: media.id },
        }));
      }
      if (widthPresent !== heightPresent) {
        issues.push(...issue(input, 'media.dimensions.partial', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.width`, `${prefix}.height`],
          metadata: { mediaId: media.id },
        }));
      }
      if (media.type === 'IMAGE' && isBlank(media.url) && !media.sourceReference) {
        issues.push(...issue(input, 'media.image.source.missing', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.url`, `${prefix}.sourceReference`],
          metadata: { mediaId: media.id },
        }));
      }
    });
    for (const [, group] of positions) {
      if (group.length < 2) continue;
      issues.push(...issue(input, 'media.position.duplicate', {
        affectedProductIds: [product.id],
        affectedFields: group.map(({ index }) => `media.${index}.position`),
        metadata: { mediaIds: group.map(({ mediaId }) => mediaId).sort() },
      }));
    }
  }
  const urlGroups = groupBy(urls, (entry) => (
    input.configuration.catalog.enableCrossProductChecks
      ? entry.value
      : `${entry.productId}\u0000${entry.value}`
  ));
  for (const [, group] of urlGroups) {
    if (group.length < 2) continue;
    issues.push(...issue(input, 'media.url.duplicate', {
      affectedProductIds: group.map(({ productId }) => productId),
      affectedFields: group.map(({ index }) => `media.${index}.url`),
      scope: group.some(({ productId }) => productId !== group[0].productId) ? 'CATALOG' : 'PRODUCT',
      metadata: { mediaIds: group.map(({ mediaId }) => mediaId).sort(), duplicateCount: group.length },
    }));
  }
  return issues;
}

export function evaluateSeoRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  for (const product of input.context.products) {
    const title = product.seo.title;
    const description = product.seo.description;
    if (isBlank(title)) {
      issues.push(...issue(input, 'seo.title.missing', {
        affectedProductIds: [product.id],
        affectedFields: ['seo.title'],
      }));
    } else {
      const length = (title as string).length;
      if (length < input.configuration.seoTitle.minimumLength) {
        issues.push(...issue(input, 'seo.title.too_short', {
          affectedProductIds: [product.id],
          affectedFields: ['seo.title'],
          metadata: { actualLength: length, minimumLength: input.configuration.seoTitle.minimumLength },
        }));
      } else if (length > input.configuration.seoTitle.maximumLength) {
        issues.push(...issue(input, 'seo.title.too_long', {
          affectedProductIds: [product.id],
          affectedFields: ['seo.title'],
          metadata: { actualLength: length, maximumLength: input.configuration.seoTitle.maximumLength },
        }));
      }
    }
    if (isBlank(description)) {
      issues.push(...issue(input, 'seo.description.missing', {
        affectedProductIds: [product.id],
        affectedFields: ['seo.description'],
      }));
    } else {
      const length = (description as string).length;
      if (length < input.configuration.seoDescription.minimumLength) {
        issues.push(...issue(input, 'seo.description.too_short', {
          affectedProductIds: [product.id],
          affectedFields: ['seo.description'],
          metadata: { actualLength: length, minimumLength: input.configuration.seoDescription.minimumLength },
        }));
      } else if (length > input.configuration.seoDescription.maximumLength) {
        issues.push(...issue(input, 'seo.description.too_long', {
          affectedProductIds: [product.id],
          affectedFields: ['seo.description'],
          metadata: { actualLength: length, maximumLength: input.configuration.seoDescription.maximumLength },
        }));
      }
    }
  }
  return issues;
}

export function evaluateSpecificationRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  for (const product of input.context.products) {
    const exact = new Map<string, number[]>();
    const normalized = new Map<string, Array<{ index: number; exact: string }>>();
    product.specifications.forEach((specification, index) => {
      const prefix = `specifications.${index}`;
      if (isBlank(specification.key)) {
        issues.push(...issue(input, 'specification.key.missing', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.key`],
        }));
      } else {
        const exactIdentity = `${specification.namespace ?? ''}\u0000${specification.key}`;
        const exactGroup = exact.get(exactIdentity) ?? [];
        exactGroup.push(index);
        exact.set(exactIdentity, exactGroup);
        const normalizedIdentity = normalizeSpecificationIdentity(specification.namespace, specification.key);
        const normalizedGroup = normalized.get(normalizedIdentity) ?? [];
        normalizedGroup.push({ index, exact: exactIdentity });
        normalized.set(normalizedIdentity, normalizedGroup);
      }
      if (isBlank(specification.rawValue) && isBlank(specification.normalizedValue)) {
        issues.push(...issue(input, 'specification.value.missing', {
          affectedProductIds: [product.id],
          affectedFields: [`${prefix}.rawValue`, `${prefix}.normalizedValue`],
        }));
      }
      if (specification.unit !== undefined) {
        if (isBlank(specification.unit)) {
          issues.push(...issue(input, 'specification.unit.blank', {
            affectedProductIds: [product.id],
            affectedFields: [`${prefix}.unit`],
          }));
        } else if (!['INTEGER', 'DECIMAL'].includes(specification.valueType)) {
          issues.push(...issue(input, 'specification.unit.unsupported', {
            affectedProductIds: [product.id],
            affectedFields: [`${prefix}.unit`, `${prefix}.valueType`],
          }));
        }
      }
    });
    for (const [, indexes] of exact) {
      if (indexes.length < 2) continue;
      issues.push(...issue(input, 'specification.duplicate', {
        affectedProductIds: [product.id],
        affectedFields: indexes.map((index) => `specifications.${index}`),
      }));
    }
    for (const [, group] of normalized) {
      if (group.length < 2 || new Set(group.map(({ exact: identity }) => identity)).size < 2) continue;
      issues.push(...issue(input, 'specification.key.normalized_duplicate', {
        affectedProductIds: [product.id],
        affectedFields: group.map(({ index }) => `specifications.${index}.key`),
      }));
    }
  }
  return issues;
}

export function evaluateTagRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  const issues: IntelligenceIssue[] = [];
  for (const product of input.context.products) {
    const seen = new Map<string, number[]>();
    product.tags.forEach((tag, index) => {
      if (isBlank(tag)) {
        issues.push(...issue(input, 'tag.empty', {
          affectedProductIds: [product.id],
          affectedFields: [`tags.${index}`],
        }));
        return;
      }
      const normalized = normalizeConfiguredText(tag, input.configuration);
      const indexes = seen.get(normalized) ?? [];
      indexes.push(index);
      seen.set(normalized, indexes);
    });
    for (const [, indexes] of seen) {
      if (indexes.length < 2) continue;
      issues.push(...issue(input, 'tag.duplicate', {
        affectedProductIds: [product.id],
        affectedFields: indexes.map((index) => `tags.${index}`),
      }));
    }
    if (product.tags.length > input.configuration.tags.maximumCount) {
      issues.push(...issue(input, 'tag.count.excessive', {
        affectedProductIds: [product.id],
        affectedFields: ['tags'],
        metadata: {
          actualCount: product.tags.length,
          maximumCount: input.configuration.tags.maximumCount,
          countPolicy: 'RAW_STORED_COUNT',
        },
      }));
    }
  }
  return issues;
}

function catalogDuplicateIssues(
  input: EvaluationInput,
  ruleId: string,
  field: string,
  values: readonly { productId: string; value: unknown }[],
): readonly IntelligenceIssue[] {
  if (!input.configuration.catalog.enableCrossProductChecks) return [];
  const issues: IntelligenceIssue[] = [];
  const groups = groupBy(
    values.filter(({ value }) => !isBlank(value)),
    ({ value }) => normalizeConfiguredText(value, input.configuration),
  );
  for (const [value, group] of groups) {
    if ((!value && !input.configuration.duplicateDetection.compareEmptyValues) || group.length < 2) continue;
    issues.push(...issue(input, ruleId, {
      affectedProductIds: group.map(({ productId }) => productId),
      affectedFields: [field],
      scope: 'CATALOG',
      metadata: { duplicateCount: group.length },
    }));
  }
  return issues;
}

export function evaluateCatalogRules(input: EvaluationInput): readonly IntelligenceIssue[] {
  return [
    ...catalogDuplicateIssues(
      input,
      'catalog.product.title.duplicate',
      'title',
      input.context.products.map((product) => ({ productId: product.id, value: product.title })),
    ),
    ...catalogDuplicateIssues(
      input,
      'catalog.handle.duplicate',
      'seo.handle',
      input.context.products.map((product) => ({ productId: product.id, value: product.seo.handle })),
    ),
  ];
}
