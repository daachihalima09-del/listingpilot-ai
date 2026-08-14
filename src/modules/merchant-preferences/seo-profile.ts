import { z } from 'zod';

export const seoSetupModeSchema = z.enum([
  'LISTINGPILOT_STANDARD',
  'REVIEW_EXISTING_SEO',
  'MANUAL',
]);
export const seoAnalysisStatusSchema = z.enum([
  'NOT_REQUIRED',
  'PENDING_ANALYSIS',
  'ANALYZING',
  'READY_FOR_REVIEW',
  'APPROVED',
  'FAILED',
]);
export const searchIntentSchema = z.enum([
  'PRODUCT_DISCOVERY', 'EXACT_MODEL', 'CATEGORY_COMPARISON', 'FEATURE_LED',
  'BRAND_LED', 'USE_CASE_LED', 'LOCAL_PURCHASE',
]);

const uniqueStrings = z.array(z.string().trim().min(1).max(100)).max(50)
  .superRefine((values, context) => {
    const normalized = values.map((value) => value.toLocaleLowerCase('en-US'));
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Values must be unique.' });
    }
  });

const rangeSchema = z.object({ minimum: z.number().int().nonnegative(), maximum: z.number().int().positive() })
  .strict().refine(({ minimum, maximum }) => minimum <= maximum, 'Minimum must not exceed maximum.');

export const seoRulesSchema = z.object({
  title: z.object({
    strategy: z.enum(['PRODUCT_IDENTITY_FIRST', 'KEYWORD_FIRST', 'BALANCED']),
    primaryKeywordPlacement: z.enum(['FIRST', 'EARLY', 'NATURAL']),
    brandPlacement: z.enum(['FIRST', 'LAST', 'OMIT_WHEN_UNNECESSARY']),
    includeModelNumber: z.boolean(), includeProductType: z.boolean(),
    includeSizeOrCapacity: z.boolean(), includeImportantDifferentiator: z.boolean(),
    storeNamePlacement: z.enum(['NEVER', 'WHEN_SPACE_ALLOWS', 'ALWAYS']),
    separator: z.enum(['PIPE', 'DASH', 'EN_DASH', 'MIDDLE_DOT', 'NONE']),
    targetRange: rangeSchema, hardMaximum: z.number().int().min(40).max(200),
    preventDuplicates: z.boolean(), prohibitPromotionalWording: z.boolean(),
  }).strict().superRefine((rules, context) => {
    if (rules.targetRange.maximum > rules.hardMaximum) context.addIssue({ code: z.ZodIssueCode.custom, message: 'SEO title target maximum cannot exceed the hard maximum.', path: ['targetRange'] });
  }),
  metaDescription: z.object({
    tone: z.enum(['CLEAR', 'TECHNICAL', 'PREMIUM', 'CONVERSION_FOCUSED', 'MINIMAL']),
    targetRange: rangeSchema, productIdentityFirst: z.boolean(), includeMainBenefit: z.boolean(),
    includeImportantSpecifications: z.boolean(), includeUseCase: z.boolean(),
    availabilityWording: z.boolean(), shippingWording: z.boolean(), storeNameInclusion: z.boolean(),
    ctaPolicy: z.enum(['NONE', 'SOFT', 'DIRECT']), preventDuplicates: z.boolean(),
    prohibitPromotionalClaims: z.boolean(), sentenceCount: z.number().int().min(1).max(4),
    punctuationStyle: z.enum(['STANDARD', 'MINIMAL']),
  }).strict().superRefine((rules, context) => {
    if (rules.targetRange.maximum > 320) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Meta-description target maximum must be 320 characters or fewer.', path: ['targetRange'] });
  }),
  urlHandle: z.object({
    includeBrand: z.boolean(), includeModel: z.boolean(), includeProductType: z.boolean(),
    includeSizeOrCapacity: z.boolean(), includeCategory: z.boolean(),
    maximumWordCount: z.number().int().min(2).max(20), maximumCharacterTarget: z.number().int().min(20).max(255),
    enforceLowercase: z.literal(true), hyphenSeparated: z.literal(true), removeStopWords: z.boolean(),
    duplicateStrategy: z.enum(['ERROR', 'APPEND_MODEL', 'REQUIRE_REVIEW']),
    existingHandlePolicy: z.enum(['PRESERVE_EXISTING', 'SUGGEST_IMPROVEMENT', 'ALLOW_REPLACEMENT_WITH_CONFIRMATION']),
    redirectRequiredForReplacement: z.literal(true),
  }).strict(),
  searchIntent: z.object({ priorities: z.array(searchIntentSchema).min(1).max(7).superRefine((values, context) => {
    if (new Set(values).size !== values.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Search-intent priorities must be unique.' });
  }) }).strict(),
  keywords: z.object({
    requirePrimaryKeyword: z.boolean(), secondaryKeywordRange: rangeSchema,
    useSynonyms: z.boolean(), useLongTailPhrases: z.boolean(), prioritizeModelNumber: z.boolean(),
    localModifierPolicy: z.enum(['NEVER', 'WHEN_RELEVANT', 'REQUIRED']),
    repetitionThreshold: z.number().min(1).max(5), preventKeywordStuffing: z.literal(true),
    prohibitUnsupportedKeywords: z.literal(true), singularPluralHandling: z.enum(['NATURAL', 'PREFER_SINGULAR', 'PREFER_PLURAL']),
    prohibitedTerms: uniqueStrings,
  }).strict(),
  branding: z.object({
    includeBrand: z.boolean(), includeStoreName: z.boolean(), includeMarketplaceVendorName: z.boolean(),
    preferredStoreDisplayName: z.string().trim().max(100), geographicSuffix: z.string().trim().max(50),
    separateBrandAndVendor: z.literal(true), deriveBrandFromVendor: z.literal(false),
  }).strict(),
  imageSeo: z.object({
    generateAltText: z.boolean(), includeBrand: z.boolean(), includeModel: z.boolean(), includeProductType: z.boolean(),
    includeVisibleDifferentiator: z.boolean(), avoidDecorativeLanguage: z.literal(true), preventKeywordStuffing: z.literal(true),
    existingAltTextPolicy: z.enum(['PRESERVE', 'SUGGEST_IF_WEAK', 'REPLACE_WITH_CONFIRMATION']),
    decorativeImageHandling: z.enum(['EMPTY_ALT', 'PRESERVE', 'REVIEW']), filenameSuggestionPolicy: z.enum(['NONE', 'SUGGEST', 'REQUIRE_REVIEW']),
    maximumDescriptiveDetail: z.enum(['CONCISE', 'BALANCED', 'DETAILED']),
  }).strict(),
  structuredData: z.object({
    validateProduct: z.boolean(), validateOffer: z.boolean(), validateAvailability: z.boolean(), validatePrice: z.boolean(),
    validateBrand: z.boolean(), validateIdentifiersWhenPresent: z.boolean(), validateImagePresence: z.boolean(),
    validateMerchantListingEligibility: z.boolean(), warnMissingIdentifiers: z.boolean(), neverInventIdentifiers: z.literal(true),
    outputPolicy: z.enum(['TRUST_EXISTING', 'REQUEST_INSPECTION']), injectStructuredData: z.literal(false),
  }).strict(),
  indexing: z.object({
    publishIndexableByDefault: z.boolean(), draftProductPolicy: z.enum(['PRESERVE', 'REVIEW']),
    duplicateProductPolicy: z.enum(['REVIEW', 'PRESERVE']), missingContentPolicy: z.enum(['REVIEW', 'PRESERVE']),
    hiddenProductPolicy: z.enum(['PRESERVE', 'REVIEW']), respectSeoHidden: z.literal(true),
    requireConfirmationForNoindex: z.literal(true), neverAutoNoindex: z.literal(true), detectConflicts: z.literal(true),
  }).strict(),
  quality: z.object({
    requireUniqueTitle: z.boolean(), requireUniqueDescription: z.boolean(), requireTitleProductConsistency: z.boolean(),
    requireDescriptionPageConsistency: z.boolean(), requireVerifiedClaims: z.literal(true), detectKeywordRepetition: z.boolean(),
    detectMissingIdentity: z.boolean(), detectMissingModelWhenApplicable: z.boolean(), detectDuplicateHandles: z.boolean(),
    detectWeakAltText: z.boolean(), detectUnsupportedSuperlatives: z.boolean(), detectMetadataConflicts: z.boolean(),
    detectBrandVendorConfusion: z.boolean(), detectLanguageMismatch: z.boolean(), detectEmptyMetadata: z.boolean(),
    defaultSeverity: z.enum(['INFO', 'WARNING', 'BLOCKING']), targetRangeExceededSeverity: z.enum(['INFO', 'WARNING']),
  }).strict(),
}).strict();

export type SeoRules = z.infer<typeof seoRulesSchema>;

export const seoProfileDataSchema = z.object({
  setupMode: seoSetupModeSchema,
  analysisStatus: seoAnalysisStatusSchema,
  approved: z.literal(true),
  rules: seoRulesSchema,
}).strict().superRefine((data, context) => {
  if (data.setupMode === 'REVIEW_EXISTING_SEO') {
    if (!['PENDING_ANALYSIS', 'ANALYZING', 'READY_FOR_REVIEW', 'APPROVED', 'FAILED'].includes(data.analysisStatus)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Review Existing SEO requires a review analysis status.', path: ['analysisStatus'] });
    }
  } else if (data.analysisStatus !== 'NOT_REQUIRED') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'This SEO setup mode does not require analysis.', path: ['analysisStatus'] });
  }
});

export type SeoProfile = z.infer<typeof seoProfileDataSchema>;

export const listingPilotSeoStandard: Readonly<SeoRules> = Object.freeze({
  title: { strategy: 'PRODUCT_IDENTITY_FIRST', primaryKeywordPlacement: 'EARLY', brandPlacement: 'OMIT_WHEN_UNNECESSARY', includeModelNumber: true, includeProductType: true, includeSizeOrCapacity: true, includeImportantDifferentiator: true, storeNamePlacement: 'WHEN_SPACE_ALLOWS', separator: 'PIPE', targetRange: { minimum: 45, maximum: 65 }, hardMaximum: 120, preventDuplicates: true, prohibitPromotionalWording: true },
  metaDescription: { tone: 'CLEAR', targetRange: { minimum: 120, maximum: 160 }, productIdentityFirst: true, includeMainBenefit: true, includeImportantSpecifications: true, includeUseCase: false, availabilityWording: false, shippingWording: false, storeNameInclusion: false, ctaPolicy: 'SOFT', preventDuplicates: true, prohibitPromotionalClaims: true, sentenceCount: 2, punctuationStyle: 'STANDARD' },
  urlHandle: { includeBrand: true, includeModel: true, includeProductType: true, includeSizeOrCapacity: false, includeCategory: false, maximumWordCount: 8, maximumCharacterTarget: 100, enforceLowercase: true, hyphenSeparated: true, removeStopWords: true, duplicateStrategy: 'REQUIRE_REVIEW', existingHandlePolicy: 'PRESERVE_EXISTING', redirectRequiredForReplacement: true },
  searchIntent: { priorities: ['EXACT_MODEL', 'PRODUCT_DISCOVERY', 'FEATURE_LED', 'LOCAL_PURCHASE'] },
  keywords: { requirePrimaryKeyword: true, secondaryKeywordRange: { minimum: 1, maximum: 3 }, useSynonyms: true, useLongTailPhrases: true, prioritizeModelNumber: true, localModifierPolicy: 'WHEN_RELEVANT', repetitionThreshold: 2.5, preventKeywordStuffing: true, prohibitUnsupportedKeywords: true, singularPluralHandling: 'NATURAL', prohibitedTerms: [] },
  branding: { includeBrand: true, includeStoreName: false, includeMarketplaceVendorName: false, preferredStoreDisplayName: '', geographicSuffix: '', separateBrandAndVendor: true, deriveBrandFromVendor: false },
  imageSeo: { generateAltText: true, includeBrand: true, includeModel: true, includeProductType: true, includeVisibleDifferentiator: true, avoidDecorativeLanguage: true, preventKeywordStuffing: true, existingAltTextPolicy: 'SUGGEST_IF_WEAK', decorativeImageHandling: 'EMPTY_ALT', filenameSuggestionPolicy: 'SUGGEST', maximumDescriptiveDetail: 'BALANCED' },
  structuredData: { validateProduct: true, validateOffer: true, validateAvailability: true, validatePrice: true, validateBrand: true, validateIdentifiersWhenPresent: true, validateImagePresence: true, validateMerchantListingEligibility: true, warnMissingIdentifiers: true, neverInventIdentifiers: true, outputPolicy: 'REQUEST_INSPECTION', injectStructuredData: false },
  indexing: { publishIndexableByDefault: true, draftProductPolicy: 'PRESERVE', duplicateProductPolicy: 'REVIEW', missingContentPolicy: 'REVIEW', hiddenProductPolicy: 'PRESERVE', respectSeoHidden: true, requireConfirmationForNoindex: true, neverAutoNoindex: true, detectConflicts: true },
  quality: { requireUniqueTitle: true, requireUniqueDescription: true, requireTitleProductConsistency: true, requireDescriptionPageConsistency: true, requireVerifiedClaims: true, detectKeywordRepetition: true, detectMissingIdentity: true, detectMissingModelWhenApplicable: true, detectDuplicateHandles: true, detectWeakAltText: true, detectUnsupportedSuperlatives: true, detectMetadataConflicts: true, detectBrandVendorConfusion: true, detectLanguageMismatch: true, detectEmptyMetadata: true, defaultSeverity: 'WARNING', targetRangeExceededSeverity: 'WARNING' },
});

export function createSeoProfile(setupMode: SeoProfile['setupMode']): SeoProfile {
  return seoProfileDataSchema.parse({
    setupMode,
    analysisStatus: setupMode === 'REVIEW_EXISTING_SEO' ? 'PENDING_ANALYSIS' : 'NOT_REQUIRED',
    approved: true,
    rules: structuredClone(listingPilotSeoStandard),
  });
}
