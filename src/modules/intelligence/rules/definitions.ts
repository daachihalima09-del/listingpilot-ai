import type { AnalysisScope, IssueCategory, IssueSeverity } from '../domain/types.ts';
import type { IntelligenceRuleDefinition } from './registry.ts';

export const DETERMINISTIC_QUALITY_CAPABILITY_ID = 'deterministic-quality';
export const DETERMINISTIC_RULE_VERSION = '1.0.0';
const allScopes: readonly AnalysisScope[] = ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'];

interface RuleSpec {
  readonly id: string;
  readonly name: string;
  readonly category: IssueCategory;
  readonly fields: readonly string[];
  readonly explanation: string;
  readonly recommendation: string;
  readonly configurationKey?: string;
  readonly family: string;
}

const specs: readonly RuleSpec[] = [
  { id: 'product.title.missing', name: 'Missing product title', category: 'DATA_QUALITY', fields: ['title'], explanation: 'The product title is missing or blank, so the product cannot be identified reliably.', recommendation: 'Add a clear product title before publishing.', family: 'product-identity' },
  { id: 'product.vendor.missing', name: 'Missing brand or vendor', category: 'DATA_QUALITY', fields: ['vendor'], explanation: 'The product has no brand or vendor value.', recommendation: 'Add the product brand or vendor.', family: 'product-identity' },
  { id: 'product.type.missing', name: 'Missing product type', category: 'DATA_QUALITY', fields: ['productType'], explanation: 'The product type is missing.', recommendation: 'Assign an appropriate generic product type.', family: 'product-identity' },
  { id: 'product.handle.missing', name: 'Missing handle', category: 'SEO', fields: ['seo.handle'], explanation: 'The product has no normalized handle or slug.', recommendation: 'Add a unique product handle or slug.', family: 'product-identity' },
  { id: 'product.status.missing', name: 'Missing product status', category: 'DATA_QUALITY', fields: ['status'], explanation: 'The normalized product status is missing.', recommendation: 'Set an explicit product status.', family: 'product-identity' },

  { id: 'product.description.missing', name: 'Missing description', category: 'DATA_QUALITY', fields: ['description'], explanation: 'No description value is present.', recommendation: 'Add a useful product description.', family: 'description' },
  { id: 'product.description.empty', name: 'Empty description', category: 'DATA_QUALITY', fields: ['description'], explanation: 'A description value is present but contains no meaningful text.', recommendation: 'Replace the empty description with useful product information.', family: 'description' },
  { id: 'product.description.too_short', name: 'Description too short', category: 'DATA_QUALITY', fields: ['description'], explanation: 'The meaningful description text is shorter than the configured minimum.', recommendation: 'Expand the description with relevant product information.', configurationKey: 'description.minimumLength', family: 'description' },
  { id: 'product.description.duplicate', name: 'Duplicate description', category: 'CATALOG_HEALTH', fields: ['description'], explanation: 'Multiple products use an equivalent normalized description.', recommendation: 'Review the affected descriptions and make each product description distinct where appropriate.', configurationKey: 'description.duplicateComparisonMode', family: 'description' },

  { id: 'product.variants.missing', name: 'Product has no variants', category: 'VARIANT', fields: ['variants'], explanation: 'The product has no normalized variants and therefore no purchasable configuration.', recommendation: 'Add at least one valid product variant.', family: 'variant' },
  { id: 'variant.sku.missing', name: 'Missing variant SKU', category: 'VARIANT', fields: ['variants.*.sku'], explanation: 'A variant has no SKU.', recommendation: 'Assign a unique SKU to the affected variant.', family: 'variant' },
  { id: 'variant.sku.duplicate', name: 'Duplicate SKU', category: 'VARIANT', fields: ['variants.*.sku'], explanation: 'The same normalized SKU is assigned to multiple variants in the analysis scope.', recommendation: 'Assign a unique SKU to every affected variant.', configurationKey: 'duplicateDetection', family: 'variant' },
  { id: 'variant.barcode.duplicate', name: 'Duplicate barcode', category: 'VARIANT', fields: ['variants.*.barcode'], explanation: 'The same normalized barcode is assigned to multiple variants in the analysis scope.', recommendation: 'Assign a unique barcode to every affected variant.', configurationKey: 'duplicateDetection', family: 'variant' },
  { id: 'variant.option.name.empty', name: 'Empty variant option name', category: 'VARIANT', fields: ['variants.*.options'], explanation: 'A variant contains an empty option name.', recommendation: 'Give every variant option a non-empty name.', family: 'variant' },
  { id: 'variant.option.value.empty', name: 'Empty variant option value', category: 'VARIANT', fields: ['variants.*.options'], explanation: 'A variant contains an empty option value.', recommendation: 'Give every variant option a non-empty value.', family: 'variant' },
  { id: 'variant.price.missing', name: 'Missing price', category: 'PRICING', fields: ['variants.*.price'], explanation: 'A variant has no selling price.', recommendation: 'Set a valid selling price for the affected variant.', family: 'variant' },
  { id: 'variant.price.invalid', name: 'Malformed price', category: 'PRICING', fields: ['variants.*.price'], explanation: 'A variant price is not a valid exact decimal string.', recommendation: 'Replace the price with a valid decimal amount.', family: 'variant' },
  { id: 'variant.price.negative', name: 'Negative price', category: 'PRICING', fields: ['variants.*.price'], explanation: 'A variant selling price is below zero.', recommendation: 'Set the selling price to zero or a positive amount.', family: 'variant' },
  { id: 'variant.compare_at.invalid', name: 'Malformed compare-at price', category: 'PRICING', fields: ['variants.*.compareAtPrice'], explanation: 'The compare-at price is not a valid exact decimal string.', recommendation: 'Set a valid compare-at price or remove it.', family: 'variant' },
  { id: 'variant.compare_at.negative', name: 'Negative compare-at price', category: 'PRICING', fields: ['variants.*.compareAtPrice'], explanation: 'The compare-at price is below zero.', recommendation: 'Set a non-negative compare-at price or remove it.', family: 'variant' },
  { id: 'variant.compare_at.below_price', name: 'Compare-at price below price', category: 'PRICING', fields: ['variants.*.compareAtPrice', 'variants.*.price'], explanation: 'The compare-at price is lower than the regular selling price.', recommendation: 'Set compare-at price above the selling price or remove it.', family: 'variant' },
  { id: 'variant.compare_at.equal_price', name: 'Ineffective compare-at price', category: 'PRICING', fields: ['variants.*.compareAtPrice', 'variants.*.price'], explanation: 'The compare-at price equals the selling price and does not represent a discount.', recommendation: 'Set compare-at price above the selling price or remove it.', family: 'variant' },
  { id: 'variant.id.duplicate', name: 'Duplicate variant identity', category: 'VARIANT', fields: ['variants.*.id'], explanation: 'A stable variant ID occurs more than once in the analysis scope.', recommendation: 'Correct the source mapping so every variant has a unique stable identity.', family: 'variant' },

  { id: 'product.media.missing', name: 'Product has no media', category: 'MEDIA', fields: ['media'], explanation: 'The product has no media.', recommendation: 'Add at least one useful product image or media item.', family: 'media' },
  { id: 'media.image.alt.missing', name: 'Missing image alt text', category: 'MEDIA', fields: ['media.*.altText'], explanation: 'An image has no descriptive alt text.', recommendation: 'Add descriptive alt text identifying the product and image purpose.', configurationKey: 'media.requireAltTextForImages', family: 'media' },
  { id: 'media.url.duplicate', name: 'Duplicate media URL', category: 'MEDIA', fields: ['media.*.url'], explanation: 'Multiple media items use the same normalized URL.', recommendation: 'Remove or replace unintended duplicate media references.', configurationKey: 'duplicateDetection.mediaUrlNormalization', family: 'media' },
  { id: 'media.position.invalid', name: 'Invalid media position', category: 'MEDIA', fields: ['media.*.position'], explanation: 'A media position is negative, non-integer, or otherwise invalid for the zero-based model.', recommendation: 'Set media positions to non-negative whole numbers.', family: 'media' },
  { id: 'media.position.duplicate', name: 'Duplicate media position', category: 'MEDIA', fields: ['media.*.position'], explanation: 'Multiple media items in one product share the same position.', recommendation: 'Assign a unique position to each media item in the product.', family: 'media' },
  { id: 'media.width.invalid', name: 'Invalid media width', category: 'MEDIA', fields: ['media.*.width'], explanation: 'Media width is present but is not a positive whole number.', recommendation: 'Correct or remove the invalid media width metadata.', family: 'media' },
  { id: 'media.height.invalid', name: 'Invalid media height', category: 'MEDIA', fields: ['media.*.height'], explanation: 'Media height is present but is not a positive whole number.', recommendation: 'Correct or remove the invalid media height metadata.', family: 'media' },
  { id: 'media.dimensions.partial', name: 'Partial media dimensions', category: 'MEDIA', fields: ['media.*.width', 'media.*.height'], explanation: 'Only one media dimension is present.', recommendation: 'Provide both width and height or remove incomplete dimension metadata.', family: 'media' },
  { id: 'media.image.source.missing', name: 'Missing image source', category: 'MEDIA', fields: ['media.*.url', 'media.*.sourceReference'], explanation: 'An image has neither a usable URL nor a source reference.', recommendation: 'Attach a usable image URL or source reference.', family: 'media' },

  { id: 'seo.title.missing', name: 'Missing SEO title', category: 'SEO', fields: ['seo.title'], explanation: 'The SEO title is missing or blank.', recommendation: 'Add a unique SEO title before publishing.', family: 'seo' },
  { id: 'seo.description.missing', name: 'Missing SEO description', category: 'SEO', fields: ['seo.description'], explanation: 'The SEO description is missing or blank.', recommendation: 'Add a useful SEO description before publishing.', family: 'seo' },
  { id: 'seo.title.too_short', name: 'SEO title too short', category: 'SEO', fields: ['seo.title'], explanation: 'The SEO title is shorter than the configured minimum.', recommendation: 'Expand the SEO title without generating replacement content automatically.', configurationKey: 'seoTitle.minimumLength', family: 'seo' },
  { id: 'seo.title.too_long', name: 'SEO title too long', category: 'SEO', fields: ['seo.title'], explanation: 'The SEO title exceeds the configured maximum.', recommendation: 'Shorten the SEO title while preserving its meaning.', configurationKey: 'seoTitle.maximumLength', family: 'seo' },
  { id: 'seo.description.too_short', name: 'SEO description too short', category: 'SEO', fields: ['seo.description'], explanation: 'The SEO description is shorter than the configured minimum.', recommendation: 'Expand the SEO description with relevant information.', configurationKey: 'seoDescription.minimumLength', family: 'seo' },
  { id: 'seo.description.too_long', name: 'SEO description too long', category: 'SEO', fields: ['seo.description'], explanation: 'The SEO description exceeds the configured maximum.', recommendation: 'Shorten the SEO description while preserving useful information.', configurationKey: 'seoDescription.maximumLength', family: 'seo' },

  { id: 'specification.key.missing', name: 'Missing specification key', category: 'SPECIFICATION', fields: ['specifications.*.key'], explanation: 'A specification has no usable key.', recommendation: 'Assign a stable generic key to the specification.', family: 'specification' },
  { id: 'specification.value.missing', name: 'Missing specification value', category: 'SPECIFICATION', fields: ['specifications.*.value'], explanation: 'A specification has neither a meaningful raw nor normalized value.', recommendation: 'Provide a valid specification value or remove the empty specification.', family: 'specification' },
  { id: 'specification.duplicate', name: 'Duplicate specification', category: 'SPECIFICATION', fields: ['specifications'], explanation: 'The same namespace and exact key occur more than once in one product.', recommendation: 'Keep one authoritative value for each specification identity.', family: 'specification' },
  { id: 'specification.key.normalized_duplicate', name: 'Duplicate normalized specification key', category: 'SPECIFICATION', fields: ['specifications.*.key'], explanation: 'Semantically equivalent keys occur in the same namespace.', recommendation: 'Standardize the duplicate specification keys and keep one authoritative value.', family: 'specification' },
  { id: 'specification.unit.blank', name: 'Blank specification unit', category: 'SPECIFICATION', fields: ['specifications.*.unit'], explanation: 'A unit is present but blank.', recommendation: 'Provide a valid unit or remove the blank unit metadata.', family: 'specification' },
  { id: 'specification.unit.unsupported', name: 'Unsupported specification unit', category: 'SPECIFICATION', fields: ['specifications.*.unit', 'specifications.*.valueType'], explanation: 'A unit is attached to a value type that cannot carry measurement units.', recommendation: 'Remove the unit or use an appropriate numeric value type.', family: 'specification' },

  { id: 'tag.empty', name: 'Empty tag', category: 'CATALOG_HEALTH', fields: ['tags'], explanation: 'The product contains an empty tag entry.', recommendation: 'Remove empty tag entries.', family: 'tag' },
  { id: 'tag.duplicate', name: 'Duplicate tag', category: 'CATALOG_HEALTH', fields: ['tags'], explanation: 'The product contains equivalent duplicate tags.', recommendation: 'Keep only one copy of each intended tag.', configurationKey: 'duplicateDetection', family: 'tag' },
  { id: 'tag.count.excessive', name: 'Excessive tag count', category: 'CATALOG_HEALTH', fields: ['tags'], explanation: 'The raw stored tag count exceeds the configured maximum.', recommendation: 'Remove unnecessary tags until the configured limit is met.', configurationKey: 'tags.maximumCount', family: 'tag' },

  { id: 'catalog.product.title.duplicate', name: 'Duplicate product title', category: 'CATALOG_HEALTH', fields: ['title'], explanation: 'Multiple products use the same normalized title in the analysis scope.', recommendation: 'Give each affected product a distinct title where appropriate.', configurationKey: 'duplicateDetection', family: 'catalog' },
  { id: 'catalog.handle.duplicate', name: 'Duplicate product handle', category: 'CATALOG_HEALTH', fields: ['seo.handle'], explanation: 'Multiple products use the same normalized handle in the analysis scope.', recommendation: 'Assign a unique handle to each affected product.', configurationKey: 'duplicateDetection', family: 'catalog' },
];

export const RULE_SEVERITY_POLICY: Readonly<Record<string, IssueSeverity>> = Object.freeze({
  'product.title.missing': 'CRITICAL',
  'product.vendor.missing': 'MEDIUM',
  'product.type.missing': 'MEDIUM',
  'product.handle.missing': 'MEDIUM',
  'product.status.missing': 'HIGH',
  'product.description.missing': 'MEDIUM',
  'product.description.empty': 'MEDIUM',
  'product.description.too_short': 'LOW',
  'product.description.duplicate': 'MEDIUM',
  'product.variants.missing': 'CRITICAL',
  'variant.sku.missing': 'HIGH',
  'variant.sku.duplicate': 'HIGH',
  'variant.barcode.duplicate': 'HIGH',
  'variant.option.name.empty': 'HIGH',
  'variant.option.value.empty': 'HIGH',
  'variant.price.missing': 'CRITICAL',
  'variant.price.invalid': 'HIGH',
  'variant.price.negative': 'CRITICAL',
  'variant.compare_at.invalid': 'HIGH',
  'variant.compare_at.negative': 'HIGH',
  'variant.compare_at.below_price': 'HIGH',
  'variant.compare_at.equal_price': 'LOW',
  'variant.id.duplicate': 'HIGH',
  'product.media.missing': 'MEDIUM',
  'media.image.alt.missing': 'LOW',
  'media.url.duplicate': 'LOW',
  'media.position.invalid': 'LOW',
  'media.position.duplicate': 'LOW',
  'media.width.invalid': 'LOW',
  'media.height.invalid': 'LOW',
  'media.dimensions.partial': 'LOW',
  'media.image.source.missing': 'MEDIUM',
  'seo.title.missing': 'MEDIUM',
  'seo.description.missing': 'MEDIUM',
  'seo.title.too_short': 'LOW',
  'seo.title.too_long': 'LOW',
  'seo.description.too_short': 'LOW',
  'seo.description.too_long': 'LOW',
  'specification.key.missing': 'MEDIUM',
  'specification.value.missing': 'MEDIUM',
  'specification.duplicate': 'MEDIUM',
  'specification.key.normalized_duplicate': 'MEDIUM',
  'specification.unit.blank': 'LOW',
  'specification.unit.unsupported': 'LOW',
  'tag.empty': 'LOW',
  'tag.duplicate': 'LOW',
  'tag.count.excessive': 'LOW',
  'catalog.product.title.duplicate': 'MEDIUM',
  'catalog.handle.duplicate': 'MEDIUM',
});

export const DEFAULT_DETERMINISTIC_RULE_DEFINITIONS: readonly IntelligenceRuleDefinition[] = Object.freeze(
  specs.map((spec) => Object.freeze({
    id: spec.id,
    name: spec.name,
    version: DETERMINISTIC_RULE_VERSION,
    description: spec.explanation,
    issueCode: spec.id.toLocaleUpperCase().replaceAll('.', '_'),
    category: spec.category,
    severity: RULE_SEVERITY_POLICY[spec.id],
    supportedScopes: allScopes,
    affectedFields: spec.fields,
    explanationTemplate: spec.explanation,
    recommendationTemplate: spec.recommendation,
    ...(spec.configurationKey ? { configurationKey: spec.configurationKey } : {}),
    requiredKnowledgePacks: [],
    requiredCapabilityPacks: [DETERMINISTIC_QUALITY_CAPABILITY_ID],
    enabled: true,
    deterministic: true,
    metadata: { family: spec.family, production: true },
  })),
);

export const DETERMINISTIC_RULE_IDS = Object.freeze(
  DEFAULT_DETERMINISTIC_RULE_DEFINITIONS.map(({ id }) => id),
);
