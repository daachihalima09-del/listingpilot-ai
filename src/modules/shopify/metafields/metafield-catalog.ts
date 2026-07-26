export const SHOPIFY_METAFIELD_CATALOG_VERSION = '1';
export const SHOPIFY_METAFIELDS_SET_BATCH_SIZE = 25;

export const shopifyMetafieldTypes = [
  'single_line_text_field',
  'multi_line_text_field',
  'list.single_line_text_field',
  'number_integer',
  'number_decimal',
  'date_time',
  'json',
] as const;

export type ShopifyMetafieldType = typeof shopifyMetafieldTypes[number];
export type MetafieldCatalogGroup =
  | 'SPECIFICATIONS'
  | 'PRODUCT_TRUTH'
  | 'GENERATED_CONTENT'
  | 'SYSTEM_METADATA';

export interface MetafieldCatalogDefinition {
  catalogId: string;
  group: MetafieldCatalogGroup;
  namespace: string;
  key: string;
  displayName: string;
  description: string;
  ownerType: 'PRODUCT';
  type: ShopifyMetafieldType;
  sourceMapping: string;
  required: boolean;
  omitEmpty: boolean;
  schemaVersion: string;
  visibility: 'STOREFRONT_SAFE' | 'OPERATIONAL_SAFE';
  maxLength?: number;
}

const define = (
  group: MetafieldCatalogGroup,
  namespace: string,
  key: string,
  displayName: string,
  description: string,
  type: ShopifyMetafieldType,
  sourceMapping: string,
  options: Partial<Pick<
    MetafieldCatalogDefinition,
    'required' | 'omitEmpty' | 'visibility' | 'maxLength'
  >> = {},
): MetafieldCatalogDefinition => ({
  catalogId: `${namespace}.${key}`,
  group,
  namespace,
  key,
  displayName,
  description,
  ownerType: 'PRODUCT',
  type,
  sourceMapping,
  required: options.required ?? false,
  omitEmpty: options.omitEmpty ?? true,
  schemaVersion: SHOPIFY_METAFIELD_CATALOG_VERSION,
  visibility: options.visibility ?? 'STOREFRONT_SAFE',
  maxLength: options.maxLength,
});

const specs = 'listingpilot_specs';
const truth = 'listingpilot_truth';
const content = 'listingpilot_content';
const system = 'listingpilot_system';

export const SHOPIFY_METAFIELD_CATALOG = [
  define('SPECIFICATIONS', specs, 'specifications_json', 'Specifications', 'Normalized verified specification fields.', 'json', 'analysis.truthRows'),
  define('SPECIFICATIONS', specs, 'key_features', 'Key features', 'Generated product feature bullets.', 'list.single_line_text_field', 'generatedListing.keyFeatures'),
  define('SPECIFICATIONS', specs, 'model_number', 'Model number', 'Product model number.', 'single_line_text_field', 'analysis.activeProduct.model'),
  define('SPECIFICATIONS', specs, 'capacity', 'Capacity', 'Verified product capacity.', 'single_line_text_field', 'analysis.truthRows.Capacity'),
  define('SPECIFICATIONS', specs, 'technology', 'Technology', 'Verified product technologies.', 'list.single_line_text_field', 'analysis.truthRows.Technology'),
  define('SPECIFICATIONS', specs, 'control', 'Control', 'Verified control methods.', 'list.single_line_text_field', 'analysis.truthRows.Control'),
  define('SPECIFICATIONS', specs, 'finish', 'Finish', 'Verified product finish.', 'single_line_text_field', 'analysis.truthRows.Finish'),
  define('SPECIFICATIONS', specs, 'version', 'Version', 'Verified product version.', 'single_line_text_field', 'analysis.truthRows.Version'),
  define('PRODUCT_TRUTH', truth, 'verification_status', 'Verification status', 'ListingPilot verification summary.', 'single_line_text_field', 'analysis.truthRows.status'),
  define('PRODUCT_TRUTH', truth, 'confidence_score', 'Confidence score', 'Normalized confidence from 0 to 100.', 'number_decimal', 'analysis.activeProduct.catalogHealth.score'),
  define('PRODUCT_TRUTH', truth, 'source_count', 'Source count', 'Number of reviewed sources.', 'number_integer', 'analysis.activeProduct.sources.length'),
  define('PRODUCT_TRUTH', truth, 'verified_field_count', 'Verified field count', 'Number of verified Product Truth fields.', 'number_integer', 'analysis.truthRows.Verified'),
  define('PRODUCT_TRUTH', truth, 'conflict_count', 'Conflict count', 'Number of unresolved Product Truth conflicts.', 'number_integer', 'analysis.truthRows.Conflict'),
  define('PRODUCT_TRUTH', truth, 'last_verified_at', 'Last verified at', 'Latest available verification timestamp.', 'date_time', 'analysis.verifiedAt'),
  define('GENERATED_CONTENT', content, 'seo_title', 'SEO title', 'Generated ListingPilot SEO title.', 'single_line_text_field', 'seoData.seoTitle'),
  define('GENERATED_CONTENT', content, 'seo_description', 'SEO description', 'Generated ListingPilot SEO description.', 'multi_line_text_field', 'seoData.seoDescription'),
  define('GENERATED_CONTENT', content, 'feature_summary', 'Feature summary', 'Generated ListingPilot feature summary.', 'multi_line_text_field', 'generatedListing.keyFeatures'),
  define('GENERATED_CONTENT', content, 'generated_tags', 'Generated tags', 'Generated ListingPilot product tags.', 'list.single_line_text_field', 'seoData.tags'),
  define('SYSTEM_METADATA', system, 'schema_version', 'Schema version', 'ListingPilot metafield catalog version.', 'single_line_text_field', 'catalog.schemaVersion', { required: true, visibility: 'OPERATIONAL_SAFE' }),
  define('SYSTEM_METADATA', system, 'project_reference', 'Project reference', 'Opaque ListingPilot project reference.', 'single_line_text_field', 'project.opaqueReference', { required: true, visibility: 'OPERATIONAL_SAFE' }),
  define('SYSTEM_METADATA', system, 'analysis_hash', 'Analysis hash', 'Stable hash of publishable analysis data.', 'single_line_text_field', 'analysis.safeHash', { visibility: 'OPERATIONAL_SAFE' }),
  define('SYSTEM_METADATA', system, 'analyzed_at', 'Analyzed at', 'Latest available analysis timestamp.', 'date_time', 'analysis.analyzedAt', { visibility: 'OPERATIONAL_SAFE' }),
  define('SYSTEM_METADATA', system, 'published_at', 'Published at', 'Latest successful metafield publication time.', 'date_time', 'configuration.lastPublishedAt', { visibility: 'OPERATIONAL_SAFE' }),
  define('SYSTEM_METADATA', system, 'generator_version', 'Generator version', 'ListingPilot generator version.', 'single_line_text_field', 'application.generatorVersion', { visibility: 'OPERATIONAL_SAFE' }),
] as const satisfies readonly MetafieldCatalogDefinition[];

export type MetafieldCatalogId =
  typeof SHOPIFY_METAFIELD_CATALOG[number]['catalogId'];

export const SHOPIFY_METAFIELD_CATALOG_BY_ID = new Map(
  SHOPIFY_METAFIELD_CATALOG.map((definition) => [
    definition.catalogId,
    definition,
  ]),
);

export function getMetafieldCatalogDefinition(catalogId: string) {
  return SHOPIFY_METAFIELD_CATALOG_BY_ID.get(catalogId);
}

