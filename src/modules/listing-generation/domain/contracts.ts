import type { IntelligenceIssue, IntelligenceRecommendation, NormalizedProduct } from '../../intelligence/domain/types.ts';
import type { ProductTruthReport, TruthFinding, TruthResolutionStatus } from '../../intelligence/product-truth/types.ts';
import type { ProductIntelligenceAnalysisResult, ProductIntelligencePack } from '../../product-intelligence/domain/contracts.ts';
import type { AiPolicyContext, EffectiveMerchantPreferences, PublishingPolicyContext } from '../../merchant-preferences/index.ts';
import type { CraftInstructionProjection } from '../../listing-craft/index.ts';

export const LISTING_GENERATION_PLAN_SCHEMA_VERSION = 1 as const;
export const LISTING_GENERATION_PLAN_VERSION = '1.0.0' as const;
export const LISTING_GENERATION_COMPOSER_VERSION = '1.0.0' as const;

export type GenerationStatus = 'READY' | 'READY_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INSUFFICIENT_DATA' | 'INVALID_CONFIGURATION';
export type GenerationBlockerCode = 'MISSING_PRODUCT_IDENTITY' | 'MISSING_REQUIRED_TRUTH' | 'CRITICAL_TRUTH_CONFLICT' | 'AMBIGUOUS_PRODUCT_IDENTITY' | 'INVALID_PRODUCT_INTELLIGENCE_RESULT' | 'INVALID_CATALOG_PROFILE' | 'INVALID_LISTING_PROFILE' | 'INVALID_SEO_PROFILE' | 'INVALID_PUBLISHING_PROFILE' | 'INVALID_AI_PROFILE' | 'PUBLISHING_POLICY_BLOCK' | 'AI_POLICY_BLOCK' | 'UNSAFE_VENDOR_BRAND_MAPPING' | 'UNSUPPORTED_DESTRUCTIVE_OPERATION' | 'STALE_PROJECT_VERSION' | 'CORRUPTED_PROJECT_STATE' | 'MISSING_SOURCE_PROVENANCE' | 'UNRESOLVED_HIGH_RISK_FIELD' | 'LOCKED_CONTENT_CONFLICT';
export type GenerationReviewType = 'FACT_REVIEW' | 'CONFLICT_REVIEW' | 'CATALOG_REVIEW' | 'TITLE_REVIEW' | 'DESCRIPTION_REVIEW' | 'FEATURE_REVIEW' | 'SEO_REVIEW' | 'HANDLE_REVIEW' | 'METAFIELD_REVIEW' | 'MEDIA_REVIEW' | 'PUBLISHING_REVIEW' | 'HIGH_RISK_REVIEW' | 'MERCHANT_OVERRIDE_REVIEW';
export type FactSelectionStatus = 'SELECTED' | 'EXCLUDED' | 'REVIEW_REQUIRED' | 'UNRESOLVED' | 'CONFLICTED' | 'NOT_APPLICABLE';
export type FactUseTarget = 'TITLE' | 'DESCRIPTION' | 'FEATURES' | 'SEO_TITLE' | 'SEO_DESCRIPTION' | 'URL_HANDLE' | 'METAFIELDS' | 'ALT_TEXT' | 'CATALOG_CLASSIFICATION' | 'COMPARISON' | 'INTERNAL_ONLY';

export interface GenerationBlocker {
  readonly code: GenerationBlockerCode; readonly severity: 'WARNING' | 'HIGH' | 'CRITICAL'; readonly sourceSystem: string;
  readonly fieldIds: readonly string[]; readonly message: string; readonly reviewRequired: boolean; readonly blocking: boolean;
  readonly relatedIssueIds: readonly string[]; readonly relatedTruthFindingIds: readonly string[]; readonly relatedContradictionIds: readonly string[]; readonly metadata: Readonly<Record<string, unknown>>;
}
export interface GenerationWarning { readonly code: string; readonly sourceSystem: string; readonly fieldIds: readonly string[]; readonly message: string; readonly metadata: Readonly<Record<string, unknown>>; }
export interface GenerationReviewRequirement {
  readonly id: string; readonly type: GenerationReviewType; readonly priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; readonly blocking: boolean;
  readonly fieldIds: readonly string[]; readonly reason: string; readonly relatedIssueIds: readonly string[]; readonly relatedFactIds: readonly string[];
  readonly relatedProfileSection: 'catalog' | 'listing' | 'seo' | 'publishing' | 'ai' | null; readonly resolutionOptions: readonly string[]; readonly metadata: Readonly<Record<string, unknown>>;
}
export interface GenerationFact {
  readonly id: string; readonly fieldId: string; readonly productId: string; readonly variantId: string | null; readonly rawValue: unknown; readonly normalizedValue: unknown;
  readonly displayValue: string | null; readonly truthStatus: TruthResolutionStatus; readonly confidence: number; readonly importance: string;
  readonly sourceReferences: readonly string[]; readonly evidenceReferences: readonly string[]; readonly selectionStatus: FactSelectionStatus; readonly selectionReason: string;
  readonly allowedUses: readonly FactUseTarget[]; readonly prohibitedUses: readonly FactUseTarget[]; readonly reviewRequirement: GenerationReviewType | null;
  readonly productIntelligenceGuidance: Readonly<{ requirementLevel: string | null; verificationPolicy: string | null; variantSensitivity: string | null; regionalSensitivity: boolean; highRisk: boolean }>;
  readonly metadata: Readonly<Record<string, unknown>>;
}
export interface LockedGenerationField { readonly field: string; readonly valueFingerprint: string; readonly lockSource: string; readonly lockedBy: string; readonly lockedAt: string; readonly reason: string; readonly overrideAllowed: boolean; }

export interface TitleGenerationPlan { readonly enabled: boolean; readonly targetCharacterRange: Readonly<{ minimum: number; maximum: number }>; readonly hardMaximum: number; readonly componentOrder: readonly string[]; readonly requiredComponents: readonly string[]; readonly optionalComponents: readonly string[]; readonly excludedComponents: readonly string[]; readonly selectedFactIds: readonly string[]; readonly separator: string; readonly capitalization: string; readonly brandPlacement: string; readonly modelPlacement: string; readonly productTypePlacement: string; readonly sizePlacement: string; readonly technologyPlacement: string; readonly maximumDifferentiators: number; readonly prohibitedTerms: readonly string[]; readonly lockedValue: string | null; readonly reviewRequirements: readonly string[]; }
export interface DescriptionGenerationPlan { readonly enabled: boolean; readonly structure: string; readonly sectionOrder: readonly string[]; readonly specificationFields: readonly string[]; readonly overviewParagraphCount: number; readonly tone: string; readonly technicalLevel: string; readonly includeUseCases: boolean; readonly includeBuyingAdvice: boolean; readonly featureSectionRequired: boolean; readonly formattingMode: 'STRUCTURED'; readonly selectedFactIds: readonly string[]; readonly omittedFactIds: readonly string[]; readonly requiredLabels: readonly string[]; readonly prohibitedTerms: readonly string[]; readonly lockedSections: readonly string[]; readonly reviewRequirements: readonly string[]; }
export interface FeatureGenerationPlan { readonly enabled: boolean; readonly targetCount: number; readonly minimumCount: number; readonly maximumCount: number; readonly maximumFeatureLength: number; readonly priorityGroups: readonly Readonly<{ id: string; priority: number; fieldIds: readonly string[] }>[]; readonly selectedFactIds: readonly string[]; readonly excludedFactIds: readonly string[]; readonly technicalFirst: boolean; readonly benefitTranslationAllowed: boolean; readonly featureOrder: string; readonly duplicateSuppression: true; readonly prohibitedClaims: readonly string[]; readonly reviewRequirements: readonly string[]; }
export interface SeoGenerationPlan { readonly enabled: boolean; readonly publishable: boolean; readonly titlePlan: Readonly<Record<string, unknown>>; readonly metaDescriptionPlan: Readonly<Record<string, unknown>>; readonly handlePlan: Readonly<Record<string, unknown>>; readonly searchIntentPriorities: readonly string[]; readonly keywordPolicy: Readonly<Record<string, unknown>>; readonly brandingPolicy: Readonly<Record<string, unknown>>; readonly imageSeoPolicy: Readonly<Record<string, unknown>>; readonly structuredDataPolicy: Readonly<Record<string, unknown>>; readonly indexingPolicy: Readonly<Record<string, unknown>>; readonly qualityRules: Readonly<Record<string, unknown>>; readonly selectedFactIds: readonly string[]; readonly prohibitedFactIds: readonly string[]; readonly reviewRequirements: readonly string[]; }
export interface CatalogClassificationPlan { readonly vendor: string | null; readonly brand: string | null; readonly productType: string | null; readonly collections: readonly string[]; readonly tags: readonly string[]; readonly classificationStatus: 'APPROVED' | 'REVIEW_REQUIRED' | 'UNAVAILABLE'; readonly confidence: number; readonly reasons: readonly string[]; readonly approvedValues: Readonly<{ vendors: readonly string[]; productTypes: readonly string[]; collections: readonly string[] }>; readonly suggestedValues: readonly string[]; readonly unapprovedValues: readonly string[]; readonly reviewRequirements: readonly string[]; readonly creationRequests: readonly never[]; }
export interface MetafieldGenerationEntry { readonly mappingId: string; readonly truthFieldId: string; readonly namespace: string; readonly key: string; readonly type: string; readonly cardinality: string; readonly selectedFactId: string | null; readonly publishPolicy: string; readonly definitionStatus: 'EXISTING_REQUIRED' | 'POLICY_ALLOWED' | 'BLOCKED'; readonly normalizationPolicy: string; readonly reviewRequirement: string | null; readonly blockedReason: string | null; }
export interface MetafieldGenerationPlan { readonly entries: readonly MetafieldGenerationEntry[]; readonly createDefinitions: false; readonly shopifyMutationAllowed: false; }
export interface MediaGenerationPlan { readonly existingImagePolicy: string; readonly newImagePolicy: string; readonly deletionPolicy: string; readonly reorderPolicy: string; readonly altTextPolicy: string; readonly selectedImageReferences: readonly string[]; readonly lockedImageReferences: readonly string[]; readonly altTextFactIds: readonly string[]; readonly reviewRequirements: readonly string[]; readonly imageGenerationAllowed: false; readonly shopifyMutationAllowed: false; }
export interface LocalizationGenerationPlan { readonly primaryLanguage: string; readonly secondaryLanguage: string | null; readonly locale: string; readonly market: string; readonly currencyDisplay: string; readonly measurementSystem: string; readonly spellingVariant: string; readonly translationPolicy: string; readonly preserveIdentifiers: true; readonly preserveBrandNames: true; readonly preserveModelNumbers: true; readonly unitConversionPolicy: 'PRESERVE_VERIFIED_SOURCE'; readonly reviewRequirements: readonly string[]; }
export interface GenerationEligibility { readonly status: GenerationStatus; readonly allowed: boolean; readonly blockers: readonly GenerationBlocker[]; readonly warnings: readonly GenerationWarning[]; readonly reviewRequirements: readonly GenerationReviewRequirement[]; readonly explanationCodes: readonly string[]; }

export interface ListingGenerationInput {
  readonly project: { readonly id: string; readonly workspaceId: string; readonly productId: string; readonly version: number; readonly expectedVersion: number; readonly status: 'DRAFT' | 'READY' | 'ARCHIVED'; readonly currentListing: Readonly<{ title?: string; description?: string; features?: string }>; readonly currentSeo: Readonly<{ title?: string; description?: string; handle?: string }>; readonly shopifyProductId?: string | null; };
  readonly product: NormalizedProduct; readonly productTruth: ProductTruthReport;
  readonly productIntelligence: { readonly analysis: ProductIntelligenceAnalysisResult | null; readonly pack: ProductIntelligencePack | null };
  readonly merchantPreferences: EffectiveMerchantPreferences; readonly aiPolicy: AiPolicyContext; readonly publishingPolicy: PublishingPolicyContext;
  readonly aiDetectiveFindings: readonly IntelligenceIssue[]; readonly recommendations: readonly IntelligenceRecommendation[];
  readonly lockedFields: readonly LockedGenerationField[]; readonly sourceFingerprint: string; readonly snapshotCreatedAt: string;
  readonly profileVersions: Readonly<Record<'catalog' | 'listing' | 'seo' | 'publishing' | 'ai', Readonly<{ schemaVersion: number; version: number; fingerprint: string }>>>;
}

export interface ListingGenerationPlan {
  readonly planId: string; readonly schemaVersion: 1; readonly planVersion: '1.0.0'; readonly composerVersion: '1.0.0'; readonly projectId: string; readonly workspaceId: string; readonly productId: string;
  readonly listingStandardId: string;
  readonly craftPlan: CraftInstructionProjection | null;
  readonly sourceFingerprint: string; readonly productTruthFingerprint: string; readonly productIntelligencePack: Readonly<{ id: string; version: string; categoryId: string } | null>;
  readonly merchantProfileVersions: ListingGenerationInput['profileVersions']; readonly generationStatus: GenerationStatus; readonly generationEligibility: GenerationEligibility;
  readonly blockers: readonly GenerationBlocker[]; readonly warnings: readonly GenerationWarning[]; readonly selectedFacts: readonly GenerationFact[]; readonly excludedFacts: readonly GenerationFact[]; readonly unresolvedFacts: readonly GenerationFact[]; readonly conflictedFacts: readonly GenerationFact[];
  readonly titlePlan: TitleGenerationPlan; readonly descriptionPlan: DescriptionGenerationPlan; readonly featurePlan: FeatureGenerationPlan; readonly seoPlan: SeoGenerationPlan; readonly catalogPlan: CatalogClassificationPlan; readonly metafieldPlan: MetafieldGenerationPlan; readonly mediaPlan: MediaGenerationPlan; readonly localizationPlan: LocalizationGenerationPlan;
  readonly reviewRequirements: readonly GenerationReviewRequirement[]; readonly lockedFields: readonly LockedGenerationField[]; readonly prohibitedOutputs: readonly string[];
  readonly aiPolicy: AiPolicyContext & Readonly<{ aiExecutionRequested: false; futureExecutionAllowed: boolean }>;
  readonly publishingConstraints: PublishingPolicyContext; readonly auditSummary: Readonly<{ selectedFactCount: number; excludedFactCount: number; blockerCount: number; warningCount: number; reviewCount: number }>;
  readonly planFingerprint: string; readonly createdAt: string; readonly metadata: Readonly<{ productTruthVersion: string; productIntelligenceFrameworkVersion: string; aiDetectiveVersion: string | null }>;
}

export interface FactSelectionInput { readonly product: NormalizedProduct; readonly findings: readonly TruthFinding[]; readonly pack: ProductIntelligencePack | null; readonly aiPolicy: AiPolicyContext; readonly publishingPolicy: PublishingPolicyContext; }
