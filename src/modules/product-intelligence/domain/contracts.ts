import type {
  IssueSeverity,
  ValueType,
} from '../../intelligence/domain/types.ts';

export const PRODUCT_INTELLIGENCE_FRAMEWORK_VERSION = '1.0.0';
export const PRODUCT_INTELLIGENCE_DETECTOR_VERSION = '1.0.0';
export const UNKNOWN_PRODUCT_CATEGORY = 'UNKNOWN';

export type ProductIntelligencePackId = string;
export type ProductIntelligencePackVersion = string;
export type ProductCategoryId = string;
export type ProductCategory = ProductCategoryId;
export type ProductIntelligencePackStatus = 'ACTIVE' | 'EXPERIMENTAL' | 'DEPRECATED';
export type ProductRequirementLevel = 'IDENTITY_REQUIRED' | 'CATEGORY_REQUIRED' | 'RECOMMENDED' | 'OPTIONAL' | 'CONDITIONAL';
export type ProductFieldImportance = 'CRITICAL' | 'IMPORTANT' | 'SUPPORTING' | 'OPTIONAL';
export type ProductVariantSensitivity = 'GLOBAL' | 'VARIANT_DEPENDENT' | 'SIZE_DEPENDENT' | 'REGION_DEPENDENT' | 'MODEL_DEPENDENT' | 'UNKNOWN';
export type CategoryDetectionStatus = 'MATCHED' | 'AMBIGUOUS' | 'UNKNOWN';
export type CategoryDetectionConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type DetectionRulePolarity = 'POSITIVE' | 'NEGATIVE';
export type DetectionNegativeOutcome = 'PENALIZE' | 'BLOCK' | 'AMBIGUATE';
export type CategoryDetectionSource = 'normalizedCategory' | 'shopifyTaxonomyCategory' | 'productType' | 'category' | 'title' | 'description' | 'tag' | 'collection' | 'brand' | 'vendor' | 'model';
export type CategoryDetectionMatch = 'EXACT' | 'PHRASE' | 'ALL_TERMS';

export interface ProductCategoryDefinition {
  readonly id: ProductCategoryId;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly parentCategoryId?: ProductCategoryId;
  readonly vertical?: string;
}

export interface ProductIntelligencePackIdentity {
  readonly id: ProductIntelligencePackId;
  readonly version: ProductIntelligencePackVersion;
  readonly categoryId: ProductCategoryId;
  readonly displayName: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly supportedProductTypes: readonly string[];
  readonly supportedCategoryTerms: readonly string[];
  readonly supportedBrands: readonly string[];
  readonly status: ProductIntelligencePackStatus;
}

export interface CategoryDetectionRule {
  readonly id: string;
  readonly version: string;
  readonly sources: readonly CategoryDetectionSource[];
  readonly match: CategoryDetectionMatch;
  readonly terms: readonly string[];
  readonly weight: number;
  readonly polarity: DetectionRulePolarity;
  readonly decisive: boolean;
  readonly negativeOutcome?: DetectionNegativeOutcome;
}

export interface CategoryDetectionDefinition {
  readonly rules: readonly CategoryDetectionRule[];
  readonly minimumMatchScore: number;
  readonly mediumConfidenceScore: number;
  readonly highConfidenceScore: number;
  readonly ambiguityMargin: number;
  readonly negativeBlockScore: number;
}

export interface ProductTruthFieldDefinition {
  readonly fieldId: string;
  readonly canonicalName: string;
  readonly displayName: string;
  readonly dataType: ValueType;
  readonly requirementLevel: ProductRequirementLevel;
  readonly importance: ProductFieldImportance;
  readonly aliases: readonly string[];
  readonly unit?: string;
  readonly allowedFormats: readonly string[];
  readonly normalizationHints: readonly string[];
  readonly verificationPolicy: 'STANDARD' | 'STRONG_EVIDENCE' | 'EXPLICIT_EVIDENCE';
  readonly sourcePriority: readonly string[];
  readonly conflictSeverity: IssueSeverity;
  readonly description: string;
  readonly variantSensitivity: ProductVariantSensitivity;
  readonly regionalSensitivity: boolean;
}

export type ProductValidationEvaluationType =
  | 'FIELDS_CONFLICT'
  | 'FIELD_VALUE_CONFLICT'
  | 'FIELD_TEXT_CONFLICT'
  | 'COUNT_MISMATCH'
  | 'PROHIBITED_DERIVATION'
  | 'REQUIRED_FIELD';

export interface ProductValidationRule {
  readonly ruleId: string;
  readonly version: string;
  readonly description: string;
  readonly severity: IssueSeverity;
  readonly applicability: 'MATCHED_CATEGORY';
  readonly requiredInputs: readonly string[];
  readonly evaluationType: ProductValidationEvaluationType;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly message: string;
  readonly recommendation: string;
}

export interface ConflictGuidanceRule {
  readonly fieldId: string;
  readonly priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  readonly reason: string;
  readonly requiresManualReview: boolean;
  readonly autoResolutionAllowed: boolean;
}

export interface FeaturePriorityDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly priority: number;
  readonly importance: ProductFieldImportance;
  readonly fieldIds: readonly string[];
  readonly applicability: string;
}

export interface ComparisonDimensionDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly priority: number;
  readonly fieldIds: readonly string[];
  readonly applicability: string;
}

export interface SeoPriorityDefinition {
  readonly identityFieldOrder: readonly string[];
  readonly maximumDifferentiators: number;
  readonly guidance: readonly string[];
  readonly vendorIsBrand: false;
}

export const productMetafieldTypes = [
  'single_line_text_field',
  'multi_line_text_field',
  'list.single_line_text_field',
  'number_integer',
  'number_decimal',
  'date_time',
  'json',
] as const;
export type ProductMetafieldType = typeof productMetafieldTypes[number];

export interface ProductMetafieldMapping {
  readonly truthFieldId: string;
  readonly namespace: string;
  readonly key: string;
  readonly type: ProductMetafieldType;
  readonly cardinality: 'ONE' | 'MANY';
  readonly requiredForPublishing: boolean;
  readonly normalizationPolicy: string;
}

export interface ProductSafetyFieldRule {
  readonly id: string;
  readonly description: string;
  readonly fieldIds: readonly string[];
}

export interface ProductSafetyGuidance {
  readonly neverInventFields: readonly string[];
  readonly neverInferRules: readonly ProductSafetyFieldRule[];
  readonly variantSafetyRules: readonly ProductSafetyFieldRule[];
  readonly regionalSafetyRules: readonly ProductSafetyFieldRule[];
  readonly evidenceRequirements: readonly ProductSafetyFieldRule[];
  readonly prohibitedTransformations: readonly ProductSafetyFieldRule[];
  readonly manualReviewFields: readonly string[];
}

export interface ProductIntelligencePack {
  readonly identity: ProductIntelligencePackIdentity;
  readonly category: ProductCategoryDefinition;
  readonly detection: CategoryDetectionDefinition;
  readonly truthFields: readonly ProductTruthFieldDefinition[];
  readonly validationRules: readonly ProductValidationRule[];
  readonly conflictGuidance: readonly ConflictGuidanceRule[];
  readonly featurePriorities: readonly FeaturePriorityDefinition[];
  readonly comparisonDimensions: readonly ComparisonDimensionDefinition[];
  readonly seoPriorities: SeoPriorityDefinition;
  readonly metafieldMappings: readonly ProductMetafieldMapping[];
  readonly safetyGuidance: ProductSafetyGuidance;
}

export interface CategoryDetectionInput {
  readonly title?: string;
  readonly productType?: string;
  readonly categories?: readonly string[];
  readonly shopifyTaxonomyCategory?: string;
  readonly normalizedCategory?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly collections?: readonly string[];
  readonly brand?: string;
  readonly vendor?: string;
  readonly model?: string;
}

export interface CategoryDetectionEvidence {
  readonly packId: ProductIntelligencePackId;
  readonly category: ProductCategoryId;
  readonly source: CategoryDetectionSource;
  readonly value: string;
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly weight: number;
  readonly polarity: DetectionRulePolarity;
}

export interface CategoryDetectionCandidate {
  readonly category: ProductCategoryId;
  readonly packId: ProductIntelligencePackId;
  readonly packVersion: ProductIntelligencePackVersion;
  readonly score: number;
  readonly confidence: CategoryDetectionConfidence;
}

export interface CategoryDetectionResult {
  readonly category: ProductCategoryId;
  readonly matchedPackId: ProductIntelligencePackId | null;
  readonly matchedPackVersion: ProductIntelligencePackVersion | null;
  readonly confidence: CategoryDetectionConfidence;
  readonly score: number;
  readonly evidence: readonly CategoryDetectionEvidence[];
  readonly negativeEvidence: readonly CategoryDetectionEvidence[];
  readonly competingCandidates: readonly CategoryDetectionCandidate[];
  readonly detectorVersion: string;
  readonly status: CategoryDetectionStatus;
}

export interface ProductCategoryValidationInput {
  readonly productId: string;
  readonly identityText?: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly evidenceReferences: Readonly<Record<string, readonly string[]>>;
  readonly derivations?: Readonly<Record<string, string>>;
}

export interface ProductCategoryValidationFinding {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly category: ProductCategoryId;
  readonly severity: IssueSeverity;
  readonly fieldIds: readonly string[];
  readonly message: string;
  readonly evidenceReferences: readonly string[];
  readonly recommendation: string;
  readonly packId: ProductIntelligencePackId;
  readonly packVersion: ProductIntelligencePackVersion;
}

export interface ProductIntelligenceReference {
  readonly id: ProductIntelligencePackId;
  readonly version: ProductIntelligencePackVersion;
}

export interface ProductCategoryRequirementState {
  readonly missingIdentityFields: readonly string[];
  readonly missingCategoryFields: readonly string[];
  readonly missingRecommendedFields: readonly string[];
}

export interface ProductIntelligenceAnalysisResult {
  readonly productId: string;
  readonly categoryDetection: CategoryDetectionResult;
  readonly intelligencePack: ProductIntelligenceReference | null;
  readonly categoryRequirements: ProductCategoryRequirementState;
  readonly categoryValidationFindings: readonly ProductCategoryValidationFinding[];
}
