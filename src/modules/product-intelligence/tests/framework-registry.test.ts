import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ProductIntelligencePack } from '../domain/contracts.ts';
import { ProductIntelligenceError } from '../domain/errors.ts';
import { detectProductCategory } from '../detection/deterministic-category-detector.ts';
import { defaultProductIntelligenceRegistry } from '../registry/default-registry.ts';
import { createProductIntelligenceRegistry } from '../registry/product-intelligence-registry.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));

function footwearPack(): ProductIntelligencePack {
  return {
    identity: { id: 'test-footwear', version: '1.0.0', categoryId: 'FOOTWEAR', displayName: 'Test footwear', description: 'Test-only non-electronics pack.', aliases: ['shoe'], supportedProductTypes: ['Running Shoe'], supportedCategoryTerms: ['footwear'], supportedBrands: [], status: 'EXPERIMENTAL' },
    category: { id: 'FOOTWEAR', displayName: 'Footwear', aliases: ['shoes'], vertical: 'FASHION' },
    detection: { minimumMatchScore: 50, mediumConfidenceScore: 70, highConfidenceScore: 100, ambiguityMargin: 10, negativeBlockScore: 100, rules: [{ id: 'footwear.type', version: '1.0.0', sources: ['productType'], match: 'EXACT', terms: ['Running Shoe'], weight: 100, polarity: 'POSITIVE', decisive: true }] },
    truthFields: [{ fieldId: 'material', canonicalName: 'material', displayName: 'Material', dataType: 'STRING', requirementLevel: 'CATEGORY_REQUIRED', importance: 'IMPORTANT', aliases: ['upper material'], allowedFormats: [], normalizationHints: [], verificationPolicy: 'STANDARD', sourcePriority: ['MANUFACTURER'], conflictSeverity: 'HIGH', description: 'Verified footwear material.', variantSensitivity: 'VARIANT_DEPENDENT', regionalSensitivity: false }],
    validationRules: [],
    conflictGuidance: [{ fieldId: 'material', priority: 'HIGH', reason: 'Material affects product truth.', requiresManualReview: true, autoResolutionAllowed: false }],
    featurePriorities: [{ id: 'construction', displayName: 'Construction', priority: 1, importance: 'IMPORTANT', fieldIds: ['material'], applicability: 'ALL' }],
    comparisonDimensions: [{ id: 'materials', displayName: 'Materials', priority: 1, fieldIds: ['material'], applicability: 'ALL' }],
    seoPriorities: { identityFieldOrder: ['material'], maximumDifferentiators: 1, guidance: ['Use verified material only.'], vendorIsBrand: false },
    metafieldMappings: [{ truthFieldId: 'material', namespace: 'listingpilot_specs', key: 'footwear_material', type: 'single_line_text_field', cardinality: 'ONE', requiredForPublishing: false, normalizationPolicy: 'VERIFIED_VALUE' }],
    safetyGuidance: { neverInventFields: ['material'], neverInferRules: [{ id: 'footwear.no-fabric-inference', description: 'Do not infer material.', fieldIds: ['material'] }], variantSafetyRules: [], regionalSafetyRules: [], evidenceRequirements: [], prohibitedTransformations: [], manualReviewFields: ['material'] },
  };
}

type MutablePack = { -readonly [Key in keyof ProductIntelligencePack]: ProductIntelligencePack[Key] };
function mutableFootwearPack(): MutablePack {
  return structuredClone(footwearPack()) as MutablePack;
}

test('core framework contains no Television or electronics assumptions', () => {
  const files = [
    'domain/contracts.ts',
    'registry/pack-validation.ts',
    'registry/product-intelligence-registry.ts',
    'detection/deterministic-category-detector.ts',
    'validation/product-intelligence-validation.ts',
  ];
  const source = files.map((file) => readFileSync(`${root}/src/modules/product-intelligence/${file}`, 'utf8')).join('\n');
  assert.doesNotMatch(source, /television|oled|hdmi|screen_size|electronics/i);
  assert.doesNotMatch(source, /if\s*\([^)]*category[^)]*===/i);
});

test('registers and detects a fake non-electronics pack without core changes', () => {
  const registry = createProductIntelligenceRegistry([footwearPack()]);
  assert.equal(registry.size, 1);
  assert.equal(registry.getById('test-footwear')?.identity.categoryId, 'FOOTWEAR');
  assert.equal(registry.getByCategory('FOOTWEAR')?.identity.id, 'test-footwear');
  assert.equal(registry.hasCategory('FOOTWEAR'), true);
  assert.deepEqual(registry.versions(), { 'test-footwear': '1.0.0' });
  const detected = detectProductCategory({ title: 'Trail runner', productType: 'Running Shoe' }, registry);
  assert.equal(detected.status, 'MATCHED');
  assert.equal(detected.category, 'FOOTWEAR');
});

test('registry rejects duplicates and remains independently scoped', () => {
  const left = createProductIntelligenceRegistry([footwearPack()]);
  const right = createProductIntelligenceRegistry();
  assert.equal(right.size, 0);
  assert.throws(() => left.register(footwearPack()), (error: unknown) => error instanceof ProductIntelligenceError && error.code === 'DUPLICATE_PACK_ID');
  const duplicateCategory = mutableFootwearPack();
  duplicateCategory.identity = { ...duplicateCategory.identity, id: 'another-footwear' };
  assert.throws(() => left.register(duplicateCategory), (error: unknown) => error instanceof ProductIntelligenceError && error.code === 'DUPLICATE_CATEGORY');
  assert.equal(left.getById('missing'), undefined);
  assert.throws(() => left.requireById('missing'), (error: unknown) => error instanceof ProductIntelligenceError && error.code === 'UNKNOWN_PACK');
});

test('generic pack validation rejects malformed and cross-referenced definitions', () => {
  const cases: Array<[ProductIntelligencePack, ProductIntelligenceError['code']]> = [];
  const invalidVersion = mutableFootwearPack(); invalidVersion.identity = { ...invalidVersion.identity, version: '1' }; cases.push([invalidVersion, 'INVALID_PACK_VERSION']);
  const duplicateField = mutableFootwearPack(); duplicateField.truthFields = [...duplicateField.truthFields, duplicateField.truthFields[0]!]; cases.push([duplicateField, 'DUPLICATE_FIELD']);
  const duplicateRule = mutableFootwearPack(); duplicateRule.validationRules = [{ ruleId: 'same', version: '1.0.0', description: 'x', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['material'], evaluationType: 'REQUIRED_FIELD', parameters: { fieldId: 'material' }, message: 'x', recommendation: 'x' }, { ruleId: 'same', version: '1.0.0', description: 'y', severity: 'HIGH', applicability: 'MATCHED_CATEGORY', requiredInputs: ['material'], evaluationType: 'REQUIRED_FIELD', parameters: { fieldId: 'material' }, message: 'y', recommendation: 'y' }]; cases.push([duplicateRule, 'INVALID_VALIDATION_RULE']);
  const unknownField = mutableFootwearPack(); unknownField.comparisonDimensions = [{ ...unknownField.comparisonDimensions[0]!, fieldIds: ['unknown'] }]; cases.push([unknownField, 'UNKNOWN_FIELD_REFERENCE']);
  const duplicateDimension = mutableFootwearPack(); duplicateDimension.comparisonDimensions = [...duplicateDimension.comparisonDimensions, { ...duplicateDimension.comparisonDimensions[0]!, priority: 2 }]; cases.push([duplicateDimension, 'INVALID_PACK']);
  const duplicateMetafield = mutableFootwearPack(); duplicateMetafield.metafieldMappings = [...duplicateMetafield.metafieldMappings, { ...duplicateMetafield.metafieldMappings[0]!, truthFieldId: 'material' }]; cases.push([duplicateMetafield, 'INVALID_METAFIELD_MAPPING']);
  const invalidPriority = mutableFootwearPack(); invalidPriority.featurePriorities = [{ ...invalidPriority.featurePriorities[0]!, priority: 0 }]; cases.push([invalidPriority, 'INVALID_PRIORITY']);
  const invalidSafety = mutableFootwearPack(); invalidSafety.safetyGuidance = { ...invalidSafety.safetyGuidance, neverInventFields: ['unknown'] }; cases.push([invalidSafety, 'UNKNOWN_FIELD_REFERENCE']);
  for (const [pack, code] of cases) assert.throws(() => createProductIntelligenceRegistry([pack]), (error: unknown) => error instanceof ProductIntelligenceError && error.code === code);
});

test('default registry and returned packs are deeply immutable', () => {
  assert.equal(Object.isFrozen(defaultProductIntelligenceRegistry), true);
  const pack = defaultProductIntelligenceRegistry.requireById('television');
  assert.equal(Object.isFrozen(pack), true);
  assert.equal(Object.isFrozen(pack.truthFields), true);
  assert.equal(Object.isFrozen(pack.truthFields[0]?.aliases), true);
  assert.throws(() => { (pack.truthFields as ProductIntelligencePack['truthFields'] & unknown[]).push(pack.truthFields[0]!); }, TypeError);
  assert.throws(() => defaultProductIntelligenceRegistry.register(footwearPack()), ProductIntelligenceError);
});
