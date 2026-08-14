import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import type {
  IntelligenceContext,
  IntelligenceIssue,
  NormalizedProduct,
} from '../../intelligence/domain/types.ts';
import type { IntelligenceHasher } from '../../intelligence/deterministic/services.ts';
import type {
  CategoryDetectionInput,
  ProductCategoryRequirementState,
  ProductCategoryValidationInput,
  ProductIntelligenceAnalysisResult,
  ProductIntelligencePack,
} from '../domain/contracts.ts';
import { detectProductCategory } from '../detection/deterministic-category-detector.ts';
import type { ProductIntelligenceRegistry } from '../registry/product-intelligence-registry.ts';
import { evaluateProductIntelligencePack } from '../validation/product-intelligence-validation.ts';

function stringAttribute(product: NormalizedProduct, key: string): string | undefined {
  const value = product.attributes[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArrayAttribute(product: NormalizedProduct, key: string): readonly string[] {
  const value = product.attributes[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

export function categoryDetectionInputForProduct(product: NormalizedProduct): CategoryDetectionInput {
  return {
    title: product.title,
    ...(product.productType ? { productType: product.productType } : {}),
    categories: product.categories,
    ...(stringAttribute(product, 'shopifyTaxonomyCategory') ? { shopifyTaxonomyCategory: stringAttribute(product, 'shopifyTaxonomyCategory') } : {}),
    ...(stringAttribute(product, 'normalizedCategory') ? { normalizedCategory: stringAttribute(product, 'normalizedCategory') } : {}),
    ...(product.description ? { description: product.description } : {}),
    tags: product.tags,
    collections: stringArrayAttribute(product, 'collections'),
    ...(stringAttribute(product, 'brand') ? { brand: stringAttribute(product, 'brand') } : {}),
    ...(product.vendor ? { vendor: product.vendor } : {}),
    ...(stringAttribute(product, 'model') ? { model: stringAttribute(product, 'model') } : {}),
  };
}

function addValue(target: Record<string, unknown>, fieldId: string, value: unknown): void {
  if (value === undefined || value === null || value === '') return;
  const existing = target[fieldId];
  if (existing === undefined) target[fieldId] = value;
  else if (Array.isArray(existing)) target[fieldId] = [...existing, value];
  else target[fieldId] = [existing, value];
}

function validationInputForProduct(
  product: NormalizedProduct,
  pack: ProductIntelligencePack,
  registry: ProductIntelligenceRegistry,
): ProductCategoryValidationInput {
  const values: Record<string, unknown> = {};
  const evidenceReferences: Record<string, string[]> = {};
  addValue(values, 'product_type', product.productType);
  addValue(values, 'vendor', product.vendor);
  addValue(values, 'brand', stringAttribute(product, 'brand'));
  addValue(values, 'model', stringAttribute(product, 'model'));
  addValue(values, 'model_suffix', stringAttribute(product, 'modelSuffix'));
  addValue(values, 'regional_variant', stringAttribute(product, 'regionalVariant'));
  for (const [key, value] of Object.entries(product.attributes)) {
    const fieldId = registry.resolveFieldId(pack.identity.id, key);
    if (fieldId) addValue(values, fieldId, value);
  }
  for (const specification of product.specifications) {
    const fieldId = registry.resolveFieldId(pack.identity.id, specification.key)
      ?? registry.resolveFieldId(pack.identity.id, specification.label);
    if (!fieldId) continue;
    addValue(values, fieldId, specification.normalizedValue ?? specification.rawValue);
    evidenceReferences[fieldId] = [...new Set([
      ...(evidenceReferences[fieldId] ?? []),
      ...specification.evidenceIds,
    ])].sort();
  }
  const rawDerivations = product.attributes.productIntelligenceDerivations;
  const derivations = rawDerivations && typeof rawDerivations === 'object' && !Array.isArray(rawDerivations)
    ? Object.fromEntries(Object.entries(rawDerivations).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;
  return {
    productId: product.id,
    identityText: product.title,
    values,
    evidenceReferences,
    ...(derivations ? { derivations } : {}),
  };
}

function requirementState(pack: ProductIntelligencePack, input: ProductCategoryValidationInput): ProductCategoryRequirementState {
  const missing = (level: ProductIntelligencePack['truthFields'][number]['requirementLevel']) => pack.truthFields
    .filter((field) => field.requirementLevel === level && (input.values[field.fieldId] === undefined || input.values[field.fieldId] === null || input.values[field.fieldId] === ''))
    .map(({ fieldId }) => fieldId)
    .sort();
  return {
    missingIdentityFields: missing('IDENTITY_REQUIRED'),
    missingCategoryFields: missing('CATEGORY_REQUIRED'),
    missingRecommendedFields: missing('RECOMMENDED'),
  };
}

export function analyzeProductIntelligence(
  product: NormalizedProduct,
  registry: ProductIntelligenceRegistry,
): ProductIntelligenceAnalysisResult {
  const categoryDetection = detectProductCategory(categoryDetectionInputForProduct(product), registry);
  const pack = categoryDetection.status === 'MATCHED' && categoryDetection.matchedPackId
    ? registry.getById(categoryDetection.matchedPackId)
    : undefined;
  if (!pack) return immutableCopy({
    productId: product.id,
    categoryDetection,
    intelligencePack: null,
    categoryRequirements: { missingIdentityFields: [], missingCategoryFields: [], missingRecommendedFields: [] },
    categoryValidationFindings: [],
  }) as ProductIntelligenceAnalysisResult;
  const validationInput = validationInputForProduct(product, pack, registry);
  return immutableCopy({
    productId: product.id,
    categoryDetection,
    intelligencePack: { id: pack.identity.id, version: pack.identity.version },
    categoryRequirements: requirementState(pack, validationInput),
    categoryValidationFindings: evaluateProductIntelligencePack(pack, validationInput),
  }) as ProductIntelligenceAnalysisResult;
}

export function analyzeProductIntelligenceContext(
  context: IntelligenceContext,
  registry: ProductIntelligenceRegistry,
): readonly ProductIntelligenceAnalysisResult[] {
  return immutableCopy([...context.products]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((product) => analyzeProductIntelligence(product, registry))) as readonly ProductIntelligenceAnalysisResult[];
}

export function createProductIntelligenceIssues(input: {
  readonly context: IntelligenceContext;
  readonly analyses: readonly ProductIntelligenceAnalysisResult[];
  readonly hasher: IntelligenceHasher;
  readonly detectorId: string;
  readonly detectorVersion: string;
}): readonly IntelligenceIssue[] {
  return immutableCopy(input.analyses.flatMap((analysis) => analysis.categoryValidationFindings.map((finding): IntelligenceIssue => {
    const fingerprint = input.hasher.hash({ productId: analysis.productId, finding });
    return {
      id: `product_intelligence_issue_${fingerprint}`,
      fingerprint,
      detectorId: input.detectorId,
      detectorVersion: input.detectorVersion,
      code: `product-intelligence.${finding.ruleId}`,
      title: 'Category Product Truth requires review',
      explanation: finding.message,
      category: 'PRODUCT_TRUTH',
      severity: finding.severity,
      status: 'OPEN',
      scope: 'FIELD',
      affectedProductIds: [analysis.productId],
      affectedVariantIds: [],
      affectedFields: finding.fieldIds,
      evidenceIds: finding.evidenceReferences,
      recommendationIds: [],
      metadata: {
        productIntelligencePackId: finding.packId,
        productIntelligencePackVersion: finding.packVersion,
        productCategory: finding.category,
        validationRuleId: finding.ruleId,
        validationRuleVersion: finding.ruleVersion,
        recommendation: finding.recommendation,
        deterministic: true,
      },
      createdAt: input.context.execution.requestedAt,
    };
  })).sort((left, right) => left.id.localeCompare(right.id))) as readonly IntelligenceIssue[];
}

export function resolvePersistedProductIntelligencePack(
  value: unknown,
  registry: ProductIntelligenceRegistry,
): ProductIntelligencePack | null {
  if (!value || typeof value !== 'object') return null;
  const reference = value as { id?: unknown; version?: unknown };
  if (typeof reference.id !== 'string' || typeof reference.version !== 'string') return null;
  const pack = registry.getById(reference.id);
  return pack?.identity.version === reference.version ? pack : null;
}
