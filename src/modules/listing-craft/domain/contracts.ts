export type CraftValidationOutcome = 'PASS' | 'PASS_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'REJECTED';
export type CraftFindingSeverity = 'INFO' | 'WARNING' | 'REVIEW' | 'ERROR';
export type CraftSection = 'TITLE' | 'SPECIFICATIONS' | 'OVERVIEW' | 'FEATURES' | 'SEO' | 'CROSS_SECTION';

export interface TitleCraftRules {
  readonly componentOrder: readonly string[];
  readonly preferredCharacterRange: Readonly<{ minimum: number; maximum: number }>;
  readonly maximumDifferentiators: number;
  readonly identityComponents: readonly string[];
  readonly removableComponentOrder: readonly string[];
  readonly allowCommas: boolean;
  readonly preserveMerchantCapitalization: boolean;
}

export interface SpecificationCraftRules {
  readonly defaultLabels: readonly string[];
  readonly fieldGroups: readonly Readonly<{
    label: string;
    fieldIds: readonly string[];
    requiredByDefault: boolean;
  }>[];
  readonly exactVerifiedValues: boolean;
  readonly omitUnavailableOptionalValues: boolean;
  readonly maximumValueLength: number;
  readonly prohibitedTopics: readonly string[];
}

export interface OverviewCraftRules {
  readonly preferredParagraphCount: number;
  readonly maximumParagraphCount: number;
  readonly identityFirst: boolean;
  readonly specificationDumpingProhibited: boolean;
  readonly benefitTranslation: 'SUPPORTED_ONLY' | 'REVIEW_REQUIRED' | 'PROHIBITED';
  readonly maximumCharacters: number;
  readonly prohibitedOpenings: readonly string[];
}

export interface FeatureCraftRules {
  readonly minimumCount: number;
  readonly maximumCount: number;
  readonly oneConceptPerFeature: boolean;
  readonly technicalFirst: boolean;
  readonly useProductIntelligencePriority: boolean;
  readonly fillerProhibited: boolean;
}

export interface DuplicationRules {
  readonly semanticComparison: boolean;
  readonly requiredIdentityRepetitionAllowed: boolean;
  readonly fullTitleRepetitionProhibited: boolean;
  readonly semanticAliases: Readonly<Record<string, readonly string[]>>;
}

export interface WordingRules {
  readonly preferredVerbs: readonly string[];
  readonly prohibitedAbsoluteTerms: readonly string[];
  readonly prohibitedEmptyAdjectives: readonly string[];
  readonly preserveVerifiedTechnologyNames: boolean;
}

export interface ProductIdentityCraftRules {
  readonly protectedFields: readonly string[];
  readonly preserveModelSuffix: boolean;
  readonly preserveRegionalIdentity: boolean;
  readonly preserveVariantFacts: boolean;
  readonly inferCondition: false;
  readonly vendorMayImplyBrand: false;
}

export interface CategoryCraftIntegrationRules {
  readonly useProductIntelligenceFieldDefinitions: boolean;
  readonly useProductIntelligenceFeaturePriorities: boolean;
  readonly genericFallback: boolean;
}

export interface CraftValidationRule {
  readonly id: string;
  readonly section: CraftSection;
  readonly severity: CraftFindingSeverity;
  readonly description: string;
}

export interface ListingCraftRulePack {
  readonly id: string;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly supportedListingStandardIds: readonly string[];
  readonly principles: readonly string[];
  readonly titleRules: TitleCraftRules;
  readonly specificationRules: SpecificationCraftRules;
  readonly overviewRules: OverviewCraftRules;
  readonly featureRules: FeatureCraftRules;
  readonly duplicationRules: DuplicationRules;
  readonly wordingRules: WordingRules;
  readonly identityRules: ProductIdentityCraftRules;
  readonly categoryIntegration: CategoryCraftIntegrationRules;
  readonly validationRules: readonly CraftValidationRule[];
}

export interface CraftComplianceFinding {
  readonly code: string;
  readonly severity: CraftFindingSeverity;
  readonly section: CraftSection;
  readonly field: string;
  readonly message: string;
  readonly relatedFactIds: readonly string[];
  readonly craftRuleId: string;
  readonly craftPackId: string;
  readonly craftPackVersion: string;
  readonly reviewRequired: boolean;
  readonly suggestedResolution: string;
}

export interface CraftComplianceResult {
  readonly status: CraftValidationOutcome;
  readonly packId: string;
  readonly packVersion: string;
  readonly findings: readonly CraftComplianceFinding[];
  readonly summary: Readonly<{ errors: number; reviews: number; warnings: number; information: number }>;
}

export type SourceAuthorityCategory =
  | 'OFFICIAL_MANUFACTURER'
  | 'OFFICIAL_TECHNICAL_SPECIFICATION'
  | 'OFFICIAL_MANUAL'
  | 'AUTHORIZED_DISTRIBUTOR'
  | 'TRUSTED_RETAILER'
  | 'MARKETPLACE_LISTING'
  | 'MERCHANT_PROVIDED'
  | 'SHOPIFY_IMPORT'
  | 'PRODUCT_INTELLIGENCE_RULE'
  | 'UNKNOWN_SOURCE';

export interface SourceAuthorityLabel {
  readonly category: SourceAuthorityCategory;
  readonly displayLabel: string;
  readonly authorityLevel: 'PRIMARY' | 'STRONG' | 'SUPPORTING' | 'MERCHANT' | 'UNVERIFIED';
  readonly sourceName: string | null;
  readonly safeReference: string | null;
  readonly verificationStatus: string;
  readonly limitations: readonly string[];
}

export interface CraftInstructionProjection {
  readonly packId: string;
  readonly packVersion: string;
  readonly displayName: string;
  readonly titleCraftRules: TitleCraftRules;
  readonly specificationCraftRules: SpecificationCraftRules;
  readonly overviewCraftRules: OverviewCraftRules;
  readonly featureCraftRules: FeatureCraftRules;
  readonly duplicationRules: DuplicationRules;
  readonly wordingRules: WordingRules;
  readonly identityRules: ProductIdentityCraftRules;
  readonly categoryCraftGuidance: CategoryCraftIntegrationRules;
}
