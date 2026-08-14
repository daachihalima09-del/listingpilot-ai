import { productMetafieldTypes, type ProductIntelligencePack } from '../domain/contracts.ts';
import { ProductIntelligenceError } from '../domain/errors.ts';
import type { ProductIntelligenceErrorCode } from '../domain/errors.ts';

const packIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const categoryIdPattern = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const fieldIdPattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const semanticVersionPattern = /^\d+\.\d+\.\d+$/;
const namespacePattern = /^[a-z][a-z0-9_]{1,62}$/;
const keyPattern = /^[a-z][a-z0-9_]{1,62}$/;

export function normalizeProductIntelligenceTerm(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
    .replace(/[\u2010-\u2015\u2212-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function duplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeProductIntelligenceTerm(value);
    if (!normalized || seen.has(normalized)) return value;
    seen.add(normalized);
  }
  return undefined;
}

function requireUnique(values: readonly string[], code: ProductIntelligenceErrorCode, label: string): void {
  const found = duplicate(values);
  if (found !== undefined) throw new ProductIntelligenceError(code, `${label} must contain unique, non-empty values.`, { value: found });
}

function assertKnownFields(fieldIds: readonly string[], known: ReadonlySet<string>, owner: string): void {
  for (const fieldId of fieldIds) {
    if (!known.has(fieldId)) throw new ProductIntelligenceError('UNKNOWN_FIELD_REFERENCE', `${owner} references an unknown Product Truth field.`, { fieldId, owner });
  }
}

function parameterFieldReferences(value: unknown, key = ''): readonly string[] {
  if (Array.isArray(value)) {
    if (key.toLocaleLowerCase('en-US').endsWith('fieldids')) return value.filter((item): item is string => typeof item === 'string');
    return value.flatMap((item) => parameterFieldReferences(item));
  }
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' && key.toLocaleLowerCase('en-US').endsWith('fieldid') ? [value] : [];
  }
  return Object.entries(value).flatMap(([childKey, child]) => parameterFieldReferences(child, childKey));
}

function validatePriorities(values: readonly { priority: number }[], label: string): void {
  const priorities = values.map(({ priority }) => priority);
  if (priorities.some((value) => !Number.isInteger(value) || value < 1)
    || new Set(priorities).size !== priorities.length) {
    throw new ProductIntelligenceError('INVALID_PRIORITY', `${label} priorities must be unique positive integers.`);
  }
}

export function validateProductIntelligencePack(pack: ProductIntelligencePack): void {
  const identity = pack?.identity;
  if (!identity || !packIdPattern.test(identity.id)) throw new ProductIntelligenceError('INVALID_PACK_ID', 'Product Intelligence Pack ID is invalid.');
  if (!semanticVersionPattern.test(identity.version)) throw new ProductIntelligenceError('INVALID_PACK_VERSION', 'Product Intelligence Pack version must use semantic versioning.');
  if (!categoryIdPattern.test(identity.categoryId) || pack.category?.id !== identity.categoryId) throw new ProductIntelligenceError('INVALID_PACK', 'Product Intelligence Pack category identity is invalid.');
  if (!identity.displayName.trim() || !identity.description.trim() || !pack.category.displayName.trim()) throw new ProductIntelligenceError('INVALID_PACK', 'Product Intelligence Pack names and description are required.');
  requireUnique(identity.aliases, 'DUPLICATE_ALIAS', 'Pack aliases');
  requireUnique(identity.supportedProductTypes, 'DUPLICATE_ALIAS', 'Supported product types');
  requireUnique(identity.supportedCategoryTerms, 'DUPLICATE_ALIAS', 'Supported category terms');
  requireUnique(pack.category.aliases, 'DUPLICATE_ALIAS', 'Category aliases');

  const fieldIds = pack.truthFields.map(({ fieldId }) => fieldId);
  requireUnique(fieldIds, 'DUPLICATE_FIELD', 'Product Truth field IDs');
  if (pack.truthFields.some(({ fieldId, canonicalName, displayName, description }) => (
    !fieldIdPattern.test(fieldId) || !canonicalName.trim() || !displayName.trim() || !description.trim()
  ))) throw new ProductIntelligenceError('INVALID_FIELD', 'Product Truth field definition is invalid.');
  const knownFields = new Set(fieldIds);
  const allAliases = pack.truthFields.flatMap(({ aliases }) => aliases);
  requireUnique(allAliases, 'DUPLICATE_ALIAS', 'Product Truth field aliases');

  const detection = pack.detection;
  if (!detection || detection.minimumMatchScore <= 0
    || detection.mediumConfidenceScore < detection.minimumMatchScore
    || detection.highConfidenceScore < detection.mediumConfidenceScore
    || detection.ambiguityMargin < 0 || detection.negativeBlockScore <= 0) {
    throw new ProductIntelligenceError('DETECTOR_CONFIGURATION_ERROR', 'Category detection thresholds are invalid.');
  }
  requireUnique(detection.rules.map(({ id }) => id), 'INVALID_DETECTION_RULE', 'Detection rule IDs');
  for (const rule of detection.rules) {
    if (!rule.id.trim() || !semanticVersionPattern.test(rule.version)
      || rule.sources.length === 0 || rule.terms.length === 0
      || !Number.isFinite(rule.weight) || rule.weight <= 0
      || duplicate(rule.terms) !== undefined
      || (rule.polarity === 'NEGATIVE' && !rule.negativeOutcome)
      || (rule.polarity === 'POSITIVE' && rule.negativeOutcome !== undefined)) {
      throw new ProductIntelligenceError('INVALID_DETECTION_RULE', 'Category detection rule is invalid.', { ruleId: rule.id });
    }
  }

  requireUnique(pack.validationRules.map(({ ruleId }) => ruleId), 'INVALID_VALIDATION_RULE', 'Validation rule IDs');
  for (const rule of pack.validationRules) {
    if (!rule.ruleId.trim() || !semanticVersionPattern.test(rule.version)
      || !rule.description.trim() || !rule.message.trim() || !rule.recommendation.trim()) {
      throw new ProductIntelligenceError('INVALID_VALIDATION_RULE', 'Product validation rule is invalid.', { ruleId: rule.ruleId });
    }
    assertKnownFields([...rule.requiredInputs, ...parameterFieldReferences(rule.parameters)], knownFields, rule.ruleId);
  }
  assertKnownFields(pack.conflictGuidance.map(({ fieldId }) => fieldId), knownFields, 'conflict guidance');
  requireUnique(pack.conflictGuidance.map(({ fieldId }) => fieldId), 'INVALID_PACK', 'Conflict guidance fields');
  validatePriorities(pack.featurePriorities, 'Feature');
  validatePriorities(pack.comparisonDimensions, 'Comparison dimension');
  requireUnique(pack.featurePriorities.map(({ id }) => id), 'INVALID_PACK', 'Feature priority IDs');
  requireUnique(pack.comparisonDimensions.map(({ id }) => id), 'INVALID_PACK', 'Comparison dimension IDs');
  for (const item of pack.featurePriorities) assertKnownFields(item.fieldIds, knownFields, item.id);
  for (const item of pack.comparisonDimensions) assertKnownFields(item.fieldIds, knownFields, item.id);
  assertKnownFields(pack.seoPriorities.identityFieldOrder, knownFields, 'SEO priorities');
  if (!Number.isInteger(pack.seoPriorities.maximumDifferentiators) || pack.seoPriorities.maximumDifferentiators < 1 || pack.seoPriorities.vendorIsBrand !== false) {
    throw new ProductIntelligenceError('INVALID_PACK', 'SEO priority guidance is invalid.');
  }

  const metafieldKeys = pack.metafieldMappings.map(({ namespace, key }) => `${namespace}.${key}`);
  requireUnique(metafieldKeys, 'INVALID_METAFIELD_MAPPING', 'Metafield namespace/key pairs');
  for (const mapping of pack.metafieldMappings) {
    assertKnownFields([mapping.truthFieldId], knownFields, `${mapping.namespace}.${mapping.key}`);
    if (!namespacePattern.test(mapping.namespace) || !keyPattern.test(mapping.key)
      || !productMetafieldTypes.includes(mapping.type)) {
      throw new ProductIntelligenceError('INVALID_METAFIELD_MAPPING', 'Product metafield mapping is invalid.', { fieldId: mapping.truthFieldId });
    }
  }

  const safetyGroups = [
    ...pack.safetyGuidance.neverInferRules,
    ...pack.safetyGuidance.variantSafetyRules,
    ...pack.safetyGuidance.regionalSafetyRules,
    ...pack.safetyGuidance.evidenceRequirements,
    ...pack.safetyGuidance.prohibitedTransformations,
  ];
  assertKnownFields([
    ...pack.safetyGuidance.neverInventFields,
    ...pack.safetyGuidance.manualReviewFields,
    ...safetyGroups.flatMap(({ fieldIds: ids }) => ids),
  ], knownFields, 'safety guidance');
  requireUnique(safetyGroups.map(({ id }) => id), 'INVALID_SAFETY_GUIDANCE', 'Safety rule IDs');
  if (safetyGroups.some(({ description, fieldIds: ids }) => !description.trim() || ids.length === 0)) {
    throw new ProductIntelligenceError('INVALID_SAFETY_GUIDANCE', 'Product safety guidance is invalid.');
  }
}
