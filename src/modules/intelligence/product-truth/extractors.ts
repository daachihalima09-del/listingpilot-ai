import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  AnalysisScope,
  Evidence,
  IntelligenceContext,
  NormalizedProduct,
  SourceReference,
  ValueType,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import {
  claimImportanceFor,
  type ProductTruthConfiguration,
} from './configuration.ts';
import type {
  ClaimImportance,
  ClaimOrigin,
  ProductClaim,
} from './types.ts';

export interface ProductTruthClaimExtractorMetadata {
  readonly id: string;
  readonly version: string;
  readonly supportedClaimNamespaces: readonly string[];
  readonly supportedScopes: readonly AnalysisScope[];
  readonly deterministic: boolean;
  readonly priority: number;
  readonly enabled: boolean;
}

export interface ProductTruthClaimExtractionResult {
  readonly claims: readonly ProductClaim[];
  readonly warnings: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
}

export interface ProductTruthClaimExtractor {
  readonly metadata: ProductTruthClaimExtractorMetadata;
  extract(context: IntelligenceContext): ProductTruthClaimExtractionResult;
}

interface ExtractorRegistration {
  readonly extractor: ProductTruthClaimExtractor;
  enabled: boolean;
}

export class ProductTruthClaimExtractorRegistry {
  private readonly entries = new Map<string, ExtractorRegistration>();

  register(extractor: ProductTruthClaimExtractor): void {
    const metadata = extractor.metadata;
    if (!metadata.id.trim() || !metadata.version.trim() || metadata.supportedScopes.length === 0
      || !Number.isFinite(metadata.priority) || metadata.priority < 0) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Product Truth claim extractor metadata is invalid.');
    }
    if (this.entries.has(metadata.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Claim extractor ID is already registered.', {
        id: metadata.id,
      });
    }
    this.entries.set(metadata.id, { extractor, enabled: metadata.enabled });
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  ordered(scope?: AnalysisScope): readonly ProductTruthClaimExtractor[] {
    return [...this.entries.values()]
      .filter(({ extractor, enabled }) => enabled
        && (!scope || extractor.metadata.supportedScopes.includes(scope)))
      .map(({ extractor }) => extractor)
      .sort((left, right) => (
        left.metadata.priority - right.metadata.priority
        || left.metadata.id.localeCompare(right.metadata.id)
      ));
  }

  snapshot(): readonly Readonly<{
    id: string;
    version: string;
    priority: number;
    enabled: boolean;
  }>[] {
    return immutableCopy([...this.entries.values()]
      .sort((left, right) => left.extractor.metadata.id.localeCompare(right.extractor.metadata.id))
      .map(({ extractor, enabled }) => ({
        id: extractor.metadata.id,
        version: extractor.metadata.version,
        priority: extractor.metadata.priority,
        enabled,
      })));
  }

  private require(id: string): ExtractorRegistration {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Claim extractor is not registered.', { id });
    }
    return entry;
  }
}

function inferredValueType(value: unknown): ValueType {
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'DECIMAL';
  if (typeof value === 'string') return 'STRING';
  if (Array.isArray(value)) return 'LIST';
  if (value !== null && typeof value === 'object') return 'OBJECT';
  return 'UNKNOWN';
}

function nonEmpty(value: unknown): boolean {
  return value !== undefined && value !== null && !(typeof value === 'string' && !value.trim());
}

function claimIdentity(input: Omit<ProductClaim, 'id'>, hasher: IntelligenceHasher): string {
  return `truth_claim_${hasher.hash({
    productId: input.productId,
    variantId: input.variantId ?? null,
    namespace: input.namespace,
    key: input.key,
    affectedFieldPath: input.affectedFieldPath,
    origin: input.origin,
    valueType: input.valueType,
    unit: input.unit ?? null,
    normalizedCandidateValue: input.normalizedCandidateValue,
    evidenceIds: [...input.evidenceIds].sort(),
    sourceReferences: input.sourceReferences.map((reference) => ({
      sourceType: reference.sourceType,
      externalId: reference.externalId ?? null,
      externalParentId: reference.externalParentId ?? null,
      url: reference.url ?? null,
    })),
  })}`;
}

function createClaim(
  input: Omit<ProductClaim, 'id'>,
  hasher: IntelligenceHasher,
): ProductClaim {
  return immutableCopy({ ...input, id: claimIdentity(input, hasher) }) as ProductClaim;
}

function fieldClaim(input: {
  readonly product: NormalizedProduct;
  readonly variantId?: string;
  readonly namespace: string;
  readonly key: string;
  readonly label: string;
  readonly fieldPath: string;
  readonly value: unknown;
  readonly valueType?: ValueType;
  readonly unit?: string;
  readonly evidenceIds?: readonly string[];
  readonly sourceReferences?: readonly SourceReference[];
  readonly configuration: ProductTruthConfiguration;
  readonly hasher: IntelligenceHasher;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): ProductClaim | null {
  if (!nonEmpty(input.value)) return null;
  return createClaim({
    productId: input.product.id,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    namespace: input.namespace,
    key: input.key,
    displayLabel: input.label,
    affectedFieldPath: input.fieldPath,
    rawValue: input.value,
    normalizedCandidateValue: input.value,
    valueType: input.valueType ?? inferredValueType(input.value),
    ...(input.unit ? { unit: input.unit } : {}),
    evidenceIds: [...new Set(input.evidenceIds ?? [])].sort(),
    sourceReferences: input.sourceReferences ?? input.product.sourceReferences,
    origin: 'NORMALIZED_PRODUCT',
    importance: claimImportanceFor(input.namespace, input.key, input.configuration),
    createdAt: input.product.updatedAt,
    metadata: input.metadata ?? {},
  }, input.hasher);
}

function extractProductClaims(
  product: NormalizedProduct,
  configuration: ProductTruthConfiguration,
  hasher: IntelligenceHasher,
): ProductClaim[] {
  const claims: (ProductClaim | null)[] = [
    fieldClaim({ product, namespace: 'product', key: 'title', label: 'Product title', fieldPath: 'title', value: product.title, configuration, hasher }),
    fieldClaim({ product, namespace: 'product', key: 'description', label: 'Product description', fieldPath: 'description', value: product.description, configuration, hasher }),
    fieldClaim({ product, namespace: 'product', key: 'vendor', label: 'Brand or vendor', fieldPath: 'vendor', value: product.vendor, configuration, hasher }),
    fieldClaim({ product, namespace: 'product', key: 'productType', label: 'Product type', fieldPath: 'productType', value: product.productType, configuration, hasher }),
    fieldClaim({ product, namespace: 'product', key: 'status', label: 'Product status', fieldPath: 'status', value: product.status, configuration, hasher }),
    fieldClaim({ product, namespace: 'seo', key: 'title', label: 'SEO title', fieldPath: 'seo.title', value: product.seo.title, evidenceIds: product.seo.evidenceIds, configuration, hasher }),
    fieldClaim({ product, namespace: 'seo', key: 'description', label: 'SEO description', fieldPath: 'seo.description', value: product.seo.description, evidenceIds: product.seo.evidenceIds, configuration, hasher }),
    fieldClaim({ product, namespace: 'seo', key: 'handle', label: 'SEO handle', fieldPath: 'seo.handle', value: product.seo.handle, evidenceIds: product.seo.evidenceIds, configuration, hasher }),
    fieldClaim({ product, namespace: 'seo', key: 'canonicalUrl', label: 'Canonical URL', fieldPath: 'seo.canonicalUrl', value: product.seo.canonicalUrl, evidenceIds: product.seo.evidenceIds, configuration, hasher }),
  ];
  for (const specification of product.specifications) {
    claims.push(fieldClaim({
      product,
      namespace: specification.namespace?.trim() || 'specification',
      key: specification.key,
      label: specification.label,
      fieldPath: `specifications.${specification.key}`,
      value: specification.normalizedValue ?? specification.rawValue,
      valueType: specification.valueType,
      unit: specification.unit,
      evidenceIds: specification.evidenceIds,
      configuration,
      hasher,
      metadata: { sourceModel: 'NormalizedSpecification' },
    }));
  }
  for (const variant of product.variants) {
    const common = {
      product,
      variantId: variant.id,
      namespace: 'variant',
      sourceReferences: variant.sourceReferences,
      configuration,
      hasher,
    };
    claims.push(
      fieldClaim({ ...common, key: 'title', label: 'Variant title', fieldPath: `variants.${variant.id}.title`, value: variant.title, evidenceIds: variant.evidenceIds }),
      fieldClaim({ ...common, key: 'sku', label: 'Variant SKU', fieldPath: `variants.${variant.id}.sku`, value: variant.sku, evidenceIds: variant.evidenceIds }),
      fieldClaim({ ...common, key: 'barcode', label: 'Variant barcode', fieldPath: `variants.${variant.id}.barcode`, value: variant.barcode, evidenceIds: variant.evidenceIds }),
      fieldClaim({ ...common, key: 'price', label: 'Variant price', fieldPath: `variants.${variant.id}.price`, value: variant.price, valueType: 'DECIMAL', evidenceIds: variant.evidenceIds }),
      fieldClaim({ ...common, key: 'compareAtPrice', label: 'Variant compare-at price', fieldPath: `variants.${variant.id}.compareAtPrice`, value: variant.compareAtPrice, valueType: 'DECIMAL', evidenceIds: variant.evidenceIds }),
    );
    for (const [key, value] of Object.entries(variant.options).sort(([left], [right]) => left.localeCompare(right))) {
      claims.push(fieldClaim({
        ...common,
        namespace: 'variant-option',
        key,
        label: key,
        fieldPath: `variants.${variant.id}.options.${key}`,
        value,
        evidenceIds: variant.evidenceIds,
      }));
    }
    for (const [key, value] of Object.entries(variant.attributes).sort(([left], [right]) => left.localeCompare(right))) {
      claims.push(fieldClaim({
        ...common,
        namespace: 'variant-attribute',
        key,
        label: key,
        fieldPath: `variants.${variant.id}.attributes.${key}`,
        value,
        evidenceIds: variant.evidenceIds,
      }));
    }
  }
  for (const media of product.media) {
    const common = {
      product,
      namespace: 'media',
      evidenceIds: media.evidenceIds,
      sourceReferences: media.sourceReference ? [media.sourceReference] : product.sourceReferences,
      configuration,
      hasher,
    };
    claims.push(
      fieldClaim({ ...common, key: `${media.id}.url`, label: 'Media URL', fieldPath: `media.${media.id}.url`, value: media.url }),
      fieldClaim({ ...common, key: `${media.id}.altText`, label: 'Media alt text', fieldPath: `media.${media.id}.altText`, value: media.altText }),
      fieldClaim({ ...common, key: `${media.id}.position`, label: 'Media position', fieldPath: `media.${media.id}.position`, value: media.position, valueType: 'INTEGER' }),
      fieldClaim({ ...common, key: `${media.id}.width`, label: 'Media width', fieldPath: `media.${media.id}.width`, value: media.width, valueType: 'INTEGER' }),
      fieldClaim({ ...common, key: `${media.id}.height`, label: 'Media height', fieldPath: `media.${media.id}.height`, value: media.height, valueType: 'INTEGER' }),
    );
  }
  for (const [key, value] of Object.entries(product.attributes).sort(([left], [right]) => left.localeCompare(right))) {
    claims.push(fieldClaim({
      product,
      namespace: 'attribute',
      key,
      label: key,
      fieldPath: `attributes.${key}`,
      value,
      configuration,
      hasher,
    }));
  }
  return claims.filter((claim): claim is ProductClaim => claim !== null);
}

export class NormalizedProductClaimExtractor implements ProductTruthClaimExtractor {
  readonly metadata: ProductTruthClaimExtractorMetadata = Object.freeze({
    id: 'product-truth.extractor.normalized-product',
    version: '1.0.0',
    supportedClaimNamespaces: ['product', 'seo', 'specification', 'variant', 'variant-option', 'media', 'attribute'],
    supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
    deterministic: true,
    priority: 100,
    enabled: true,
  } satisfies ProductTruthClaimExtractorMetadata);
  private readonly configuration: ProductTruthConfiguration;
  private readonly hasher: IntelligenceHasher;

  constructor(configuration: ProductTruthConfiguration, hasher: IntelligenceHasher) {
    this.configuration = configuration;
    this.hasher = hasher;
  }

  extract(context: IntelligenceContext): ProductTruthClaimExtractionResult {
    const claims = [...context.products]
      .sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((product) => extractProductClaims(product, this.configuration, this.hasher));
    return {
      claims,
      warnings: [],
      metrics: {
        inspectedProducts: context.products.length,
        extractedClaims: claims.length,
      },
    };
  }
}

const claimOrigins: readonly ClaimOrigin[] = [
  'NORMALIZED_PRODUCT',
  'SOURCE_IMPORT',
  'MERCHANT_SUPPLIED',
  'MANUFACTURER_SUPPLIED',
  'RETAILER_SUPPLIED',
  'DOCUMENT_SUPPLIED',
  'HUMAN_REVIEWER',
  'AI_DERIVED',
  'UNKNOWN',
];

function metadataString(evidence: Evidence, key: string): string | undefined {
  const value = evidence.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function evidenceOrigin(evidence: Evidence): ClaimOrigin {
  const configured = metadataString(evidence, 'claimOrigin');
  if (configured && claimOrigins.includes(configured as ClaimOrigin)) return configured as ClaimOrigin;
  if (evidence.type === 'HUMAN_REVIEW') return 'HUMAN_REVIEWER';
  if (evidence.type === 'DERIVED_INTERPRETATION') return 'AI_DERIVED';
  switch (evidence.sourceReference?.sourceType) {
    case 'MANUAL': return 'MERCHANT_SUPPLIED';
    case 'CSV':
    case 'COMMERCE_PLATFORM':
    case 'MARKETPLACE':
    case 'SUPPLIER_WEBSITE': return 'SOURCE_IMPORT';
    case 'DOCUMENT': return 'DOCUMENT_SUPPLIED';
    default: return 'UNKNOWN';
  }
}

function evidenceTarget(
  evidence: Evidence,
  context: IntelligenceContext,
  linkedProducts: ReadonlyMap<string, string>,
  linkedVariants: ReadonlyMap<string, { productId: string; variantId: string }>,
): { productId: string; variantId?: string } | null {
  const configuredProduct = metadataString(evidence, 'productId');
  const configuredVariant = metadataString(evidence, 'variantId');
  if (configuredProduct) {
    return { productId: configuredProduct, ...(configuredVariant ? { variantId: configuredVariant } : {}) };
  }
  const variant = linkedVariants.get(evidence.id);
  if (variant) return variant;
  const productId = linkedProducts.get(evidence.id);
  if (productId) return { productId };
  if (context.products.length === 1) return { productId: context.products[0].id };
  return null;
}

function namespaceAndKey(evidence: Evidence): {
  namespace: string;
  key: string;
  fieldPath: string;
} | null {
  const fieldPath = metadataString(evidence, 'affectedFieldPath') ?? evidence.affectedField?.trim();
  const namespace = metadataString(evidence, 'claimNamespace');
  const key = metadataString(evidence, 'claimKey');
  if (namespace && key && fieldPath) return { namespace, key, fieldPath };
  if (!fieldPath) return null;
  const parts = fieldPath.split('.').filter(Boolean);
  if (parts.length === 1) return { namespace: 'product', key: parts[0], fieldPath };
  if (parts[0] === 'seo') return { namespace: 'seo', key: parts.slice(1).join('.'), fieldPath };
  if (parts[0] === 'specifications') {
    return { namespace: namespace ?? 'specification', key: key ?? parts.slice(1).join('.'), fieldPath };
  }
  if (parts[0] === 'variants') {
    return { namespace: namespace ?? 'variant', key: key ?? parts.slice(2).join('.'), fieldPath };
  }
  if (parts[0] === 'attributes') {
    return { namespace: namespace ?? 'attribute', key: key ?? parts.slice(1).join('.'), fieldPath };
  }
  return { namespace: namespace ?? parts[0], key: key ?? parts.slice(1).join('.'), fieldPath };
}

function configuredImportance(
  evidence: Evidence,
  namespace: string,
  key: string,
  configuration: ProductTruthConfiguration,
): ClaimImportance {
  const value = metadataString(evidence, 'importance');
  const allowed: readonly ClaimImportance[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
  return value && allowed.includes(value as ClaimImportance)
    ? value as ClaimImportance
    : claimImportanceFor(namespace, key, configuration);
}

export class SuppliedEvidenceClaimExtractor implements ProductTruthClaimExtractor {
  readonly metadata: ProductTruthClaimExtractorMetadata = Object.freeze({
    id: 'product-truth.extractor.supplied-evidence',
    version: '1.0.0',
    supportedClaimNamespaces: ['*'],
    supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
    deterministic: true,
    priority: 200,
    enabled: true,
  } satisfies ProductTruthClaimExtractorMetadata);
  private readonly configuration: ProductTruthConfiguration;
  private readonly hasher: IntelligenceHasher;

  constructor(configuration: ProductTruthConfiguration, hasher: IntelligenceHasher) {
    this.configuration = configuration;
    this.hasher = hasher;
  }

  extract(context: IntelligenceContext): ProductTruthClaimExtractionResult {
    const linkedProducts = new Map<string, string>();
    const linkedVariants = new Map<string, { productId: string; variantId: string }>();
    for (const product of context.products) {
      for (const id of product.evidenceIds) linkedProducts.set(id, product.id);
      for (const specification of product.specifications) {
        for (const id of specification.evidenceIds) linkedProducts.set(id, product.id);
      }
      for (const id of product.seo.evidenceIds) linkedProducts.set(id, product.id);
      for (const media of product.media) {
        for (const id of media.evidenceIds) linkedProducts.set(id, product.id);
      }
      for (const variant of product.variants) {
        for (const id of variant.evidenceIds) {
          linkedVariants.set(id, { productId: product.id, variantId: variant.id });
        }
      }
    }
    const warnings: string[] = [];
    const claims: ProductClaim[] = [];
    for (const evidence of [...context.evidence].sort((left, right) => left.id.localeCompare(right.id))) {
      const target = evidenceTarget(evidence, context, linkedProducts, linkedVariants);
      const identity = namespaceAndKey(evidence);
      const value = evidence.normalizedValue ?? evidence.rawValue;
      if (!target) {
        warnings.push(`Evidence ${evidence.id} has no deterministic product target.`);
        continue;
      }
      if (!identity) {
        warnings.push(`Evidence ${evidence.id} has incomplete structured claim metadata.`);
        continue;
      }
      if (!nonEmpty(value)) {
        warnings.push(`Evidence ${evidence.id} has no usable structured value.`);
        continue;
      }
      const configuredType = metadataString(evidence, 'valueType');
      const validTypes: readonly ValueType[] = [
        'STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'ENUM', 'LIST', 'OBJECT', 'UNKNOWN',
      ];
      const valueType = configuredType && validTypes.includes(configuredType as ValueType)
        ? configuredType as ValueType
        : inferredValueType(value);
      claims.push(createClaim({
        productId: target.productId,
        ...(target.variantId ? { variantId: target.variantId } : {}),
        namespace: identity.namespace,
        key: identity.key,
        displayLabel: metadataString(evidence, 'displayLabel') ?? evidence.claim,
        affectedFieldPath: identity.fieldPath,
        rawValue: evidence.rawValue ?? value,
        normalizedCandidateValue: value,
        valueType,
        ...(metadataString(evidence, 'unit') ? { unit: metadataString(evidence, 'unit') } : {}),
        evidenceIds: [evidence.id],
        sourceReferences: evidence.sourceReference ? [evidence.sourceReference] : [],
        origin: evidenceOrigin(evidence),
        importance: configuredImportance(
          evidence,
          identity.namespace,
          identity.key,
          this.configuration,
        ),
        createdAt: evidence.retrievedAt,
        metadata: {
          suppliedEvidence: true,
          structured: evidence.metadata.structured === true,
          direct: evidence.metadata.direct !== false,
          merchantApprovedOverride: evidence.metadata.merchantApprovedOverride === true,
          notApplicable: evidence.metadata.notApplicable === true,
        },
      }, this.hasher));
    }
    return {
      claims,
      warnings,
      metrics: {
        inspectedEvidence: context.evidence.length,
        extractedClaims: claims.length,
        skippedEvidence: context.evidence.length - claims.length,
      },
    };
  }
}

export function createDefaultProductTruthClaimExtractorRegistry(input: {
  readonly configuration: ProductTruthConfiguration;
  readonly hasher: IntelligenceHasher;
}): ProductTruthClaimExtractorRegistry {
  const registry = new ProductTruthClaimExtractorRegistry();
  registry.register(new NormalizedProductClaimExtractor(input.configuration, input.hasher));
  registry.register(new SuppliedEvidenceClaimExtractor(input.configuration, input.hasher));
  return registry;
}

export function extractProductTruthClaims(input: {
  readonly context: IntelligenceContext;
  readonly registry: ProductTruthClaimExtractorRegistry;
}): ProductTruthClaimExtractionResult {
  const claims: ProductClaim[] = [];
  const warnings: string[] = [];
  const metrics: Record<string, number> = {};
  for (const extractor of input.registry.ordered(input.context.analysisScope)) {
    const result = extractor.extract(input.context);
    claims.push(...result.claims);
    warnings.push(...result.warnings);
    for (const [key, value] of Object.entries(result.metrics)) {
      metrics[`${extractor.metadata.id}.${key}`] = value;
    }
  }
  return immutableCopy({
    claims: claims.sort((left, right) => left.id.localeCompare(right.id)),
    warnings: [...new Set(warnings)].sort(),
    metrics,
  }) as ProductTruthClaimExtractionResult;
}
