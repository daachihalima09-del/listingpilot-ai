import { z } from 'zod';
import { immutablePreferenceValue } from './immutability.ts';

export const aiSetupModeSchema = z.enum(['LISTINGPILOT_SAFE_AI', 'BALANCED_AI', 'CREATIVE_AI', 'MANUAL']);
export const factualStrictnessSchema = z.enum(['VERIFIED_ONLY', 'VERIFIED_AND_LIKELY_WITH_LABEL', 'ALLOW_MERCHANT_APPROVED_UNVERIFIED']);
export const creativityLevelSchema = z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']);
export const uncertaintyPolicySchema = z.enum(['OMIT_UNCERTAIN_FACTS', 'FLAG_FOR_REVIEW', 'INCLUDE_WITH_CLEAR_LABEL']);
export const missingInformationPolicySchema = z.enum(['LEAVE_EMPTY', 'ADD_REVIEW_PLACEHOLDER', 'SUGGEST_EVIDENCE_NEEDED']);
export const conflictPolicySchema = z.enum(['BLOCK_GENERATION_FOR_CRITICAL_CONFLICTS', 'GENERATE_WITH_CONFLICT_WARNING', 'ALLOW_MERCHANT_SELECTED_VALUE']);
export const explanationLevelSchema = z.enum(['MINIMAL', 'STANDARD', 'DETAILED']);
export const regenerationPolicySchema = z.enum(['PRESERVE_APPROVED_CONTENT', 'REGENERATE_SELECTED_FIELDS_ONLY', 'REGENERATE_FULL_DRAFT']);
export const toneVariationSchema = z.enum(['STRICT_PROFILE_TONE', 'ALLOW_MINOR_VARIATION', 'ALLOW_BROAD_VARIATION']);
export const translationPolicySchema = z.enum(['DISABLED', 'MERCHANT_APPROVED_ONLY', 'ALLOW_DRAFT_TRANSLATIONS']);
export const qualityTierSchema = z.enum(['ECONOMY', 'STANDARD', 'PREMIUM']);
export const humanReviewThresholdSchema = z.enum(['ALWAYS_REVIEW', 'REVIEW_IF_UNCERTAIN', 'REVIEW_IF_HIGH_RISK', 'REVIEW_IF_CONFLICTED', 'REVIEW_IF_LOW_CONFIDENCE']);
export const highRiskCategorySchema = z.enum(['SAFETY', 'HEALTH', 'MEDICAL', 'CHILDREN', 'FOOD', 'SUPPLEMENTS', 'CHEMICALS', 'AUTOMOTIVE_COMPATIBILITY', 'ELECTRICAL_COMPATIBILITY', 'LEGAL_OR_COMPLIANCE', 'WARRANTY', 'CERTIFICATION']);
export const prohibitedAiActionSchema = z.enum([
  'INVENT_FACTS', 'INVENT_MODEL_NUMBERS', 'INVENT_SKUS', 'INVENT_BARCODES', 'INVENT_PRICES',
  'INVENT_COMPARE_AT_PRICES', 'INVENT_INVENTORY', 'INVENT_WARRANTY_TERMS', 'INVENT_AVAILABILITY',
  'INVENT_DELIVERY_PROMISES', 'INVENT_CERTIFICATIONS', 'INVENT_SAFETY_CLAIMS', 'INVENT_MEDICAL_CLAIMS',
  'INVENT_ENVIRONMENTAL_CLAIMS', 'INVENT_COMPATIBILITY', 'INVENT_INGREDIENTS', 'INVENT_MATERIALS',
  'INVENT_DIMENSIONS', 'INVENT_PERFORMANCE_METRICS', 'HIDE_PRODUCT_TRUTH_CONFLICTS',
  'CHANGE_LOCKED_MERCHANT_CONTENT', 'GENERATE_PROHIBITED_PROMOTIONAL_SUPERLATIVES',
  'TREAT_VENDOR_AS_BRAND_WITHOUT_MAPPING', 'USE_DISPUTED_VALUES_AS_VERIFIED',
]);

const bcp47Schema = z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u, 'Use a valid BCP-47 language tag.');
const localeSchema = z.string().trim().min(2).max(35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u, 'Use a valid locale.');
const uniqueEnumArray = <T extends z.ZodTypeAny>(schema: T) => z.array(schema).min(1).superRefine((values, context) => {
  if (new Set(values).size !== values.length) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Values must not contain duplicates.' });
});

export const aiPoliciesSchema = z.object({
  factualStrictness: factualStrictnessSchema,
  creativity: creativityLevelSchema,
  uncertainty: uncertaintyPolicySchema,
  missingInformation: missingInformationPolicySchema,
  conflicts: conflictPolicySchema,
  evidence: z.object({
    minimumEvidenceLevel: z.enum(['VERIFIED', 'LIKELY_WITH_REVIEW']),
    minimumIndependentSourceCount: z.number().int().min(1).max(10),
    sourcePolicy: z.enum(['REQUIRE_OFFICIAL_FOR_HIGH_RISK_FIELDS', 'PREFER_OFFICIAL', 'ALLOW_TRUSTED_RETAILER', 'ALLOW_MERCHANT_SOURCE']),
    missingProvenanceCeiling: z.enum(['OMIT', 'REVIEW_ONLY']),
    aiDerivedEvidencePenalty: z.literal(true),
    merchantOverrideTreatment: z.enum(['REQUIRE_TRACEABLE_APPROVAL', 'ALLOW_APPROVED_WITH_WARNING']),
    staleEvidenceTreatment: z.enum(['REQUIRE_REVIEW', 'OMIT']),
  }).strict(),
  explanation: z.object({ level: explanationLevelSchema, explainSource: z.boolean(), explainConflicts: z.boolean(), explainOmissions: z.boolean(), explainReviewRequirement: z.boolean(), explainProfileInfluence: z.boolean() }).strict(),
  regeneration: z.object({ policy: regenerationPolicySchema, preserveApprovedContent: z.literal(true), preserveLockedFields: z.literal(true), fullRegenerationRequiresExplicitAction: z.literal(true) }).strict(),
  localization: z.object({
    primaryLanguage: bcp47Schema,
    secondaryLanguage: bcp47Schema.nullable(),
    locale: localeSchema,
    market: z.string().trim().regex(/^[A-Z]{2}$/u, 'Market must be a two-letter ISO country code.'),
    measurementSystem: z.enum(['PRESERVE_SOURCE', 'METRIC', 'IMPERIAL']),
    currencyDisplay: z.enum(['PRESERVE_SOURCE', 'MERCHANT_CURRENCY']),
    currencyCode: z.string().trim().regex(/^[A-Z]{3}$/u, 'Currency must be a three-letter ISO code.'),
    spellingVariant: z.enum(['LOCALE_DEFAULT', 'AMERICAN_ENGLISH', 'BRITISH_ENGLISH']),
    translationPolicy: translationPolicySchema,
    preserveIdentifiersAndUnits: z.literal(true),
  }).strict(),
  toneVariation: toneVariationSchema,
  prohibitedActions: uniqueEnumArray(prohibitedAiActionSchema),
  highRisk: z.object({ categories: uniqueEnumArray(highRiskCategorySchema), requireStrongerEvidence: z.literal(true), requireHumanReview: z.literal(true), prohibitGeneratedRegulatedClaims: z.literal(true) }).strict(),
  humanReviewThresholds: uniqueEnumArray(humanReviewThresholdSchema),
  bulk: z.object({ maximumReviewBatchSize: z.number().int().min(1).max(100), sampleReviewRequired: z.literal(true), stopOnCriticalConflict: z.literal(true), stopOnValidationFailure: z.literal(true), approvalBeforeApplyToAll: z.literal(true), preservePerProductEvidence: z.literal(true), preventCrossProductFactReuse: z.literal(true), preserveVariantBoundaries: z.literal(true), preserveRegionalVariants: z.literal(true), preventUnknownCategoryPackReuse: z.literal(true) }).strict(),
  modelPolicy: z.object({ qualityTier: qualityTierSchema, allowEscalation: z.boolean(), maxRetries: z.number().int().min(0).max(3), maxRegenerations: z.number().int().min(0).max(10), preferDeterministicProcessing: z.literal(true), reuseVerifiedAnalysis: z.boolean(), avoidUnnecessaryAiCalls: z.literal(true), approvalBeforeHighCostBulkOperation: z.literal(true) }).strict(),
  merchantApprovalRequired: z.literal(true),
}).strict().superRefine((policies, context) => {
  for (const action of prohibitedAiActionSchema.options) if (!policies.prohibitedActions.includes(action)) context.addIssue({ code: z.ZodIssueCode.custom, message: `The non-negotiable prohibition ${action} is required.`, path: ['prohibitedActions'] });
  if (!policies.humanReviewThresholds.includes('REVIEW_IF_HIGH_RISK')) context.addIssue({ code: z.ZodIssueCode.custom, message: 'High-risk content must require review.', path: ['humanReviewThresholds'] });
  if (!policies.humanReviewThresholds.includes('REVIEW_IF_CONFLICTED')) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Conflicted content must require review.', path: ['humanReviewThresholds'] });
  if (policies.creativity === 'HIGH' && policies.factualStrictness !== 'VERIFIED_ONLY') context.addIssue({ code: z.ZodIssueCode.custom, message: 'High creativity may not weaken verified-only factual safety.', path: ['creativity'] });
  if (policies.conflicts === 'ALLOW_MERCHANT_SELECTED_VALUE' && policies.factualStrictness !== 'ALLOW_MERCHANT_APPROVED_UNVERIFIED') context.addIssue({ code: z.ZodIssueCode.custom, message: 'Merchant-selected conflict values require the traceable merchant-approved factual policy.', path: ['conflicts'] });
  if (policies.uncertainty === 'INCLUDE_WITH_CLEAR_LABEL' && policies.factualStrictness === 'VERIFIED_ONLY') context.addIssue({ code: z.ZodIssueCode.custom, message: 'Verified-only mode cannot include uncertain facts.', path: ['uncertainty'] });
  if (policies.localization.secondaryLanguage === policies.localization.primaryLanguage) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Secondary language must differ from the primary language.', path: ['localization', 'secondaryLanguage'] });
});

export type AiPolicies = z.infer<typeof aiPoliciesSchema>;

export const aiProfileDataSchema = z.object({
  setupMode: aiSetupModeSchema,
  approved: z.literal(true),
  policies: aiPoliciesSchema,
}).strict().superRefine((profile, context) => {
  const preset = profile.setupMode === 'LISTINGPILOT_SAFE_AI'
    ? { creativity: 'LOW', toneVariation: 'STRICT_PROFILE_TONE' }
    : profile.setupMode === 'BALANCED_AI'
      ? { creativity: 'MEDIUM', toneVariation: 'ALLOW_MINOR_VARIATION' }
      : profile.setupMode === 'CREATIVE_AI'
        ? { creativity: 'HIGH', toneVariation: 'ALLOW_BROAD_VARIATION' }
        : null;
  if (preset && (
    profile.policies.factualStrictness !== 'VERIFIED_ONLY'
    || profile.policies.creativity !== preset.creativity
    || profile.policies.uncertainty !== 'FLAG_FOR_REVIEW'
    || profile.policies.conflicts !== 'BLOCK_GENERATION_FOR_CRITICAL_CONFLICTS'
    || profile.policies.toneVariation !== preset.toneVariation
  )) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Preset AI modes may not override their factual, uncertainty, conflict, creativity, or tone safeguards. Use Manual mode for custom policies.', path: ['policies'] });
});

export type AiProfile = z.infer<typeof aiProfileDataSchema>;

const everyProhibitedAction = [...prohibitedAiActionSchema.options];
const everyHighRiskCategory = [...highRiskCategorySchema.options];
const basePolicies: AiPolicies = {
  factualStrictness: 'VERIFIED_ONLY', creativity: 'LOW', uncertainty: 'FLAG_FOR_REVIEW', missingInformation: 'SUGGEST_EVIDENCE_NEEDED', conflicts: 'BLOCK_GENERATION_FOR_CRITICAL_CONFLICTS',
  evidence: { minimumEvidenceLevel: 'VERIFIED', minimumIndependentSourceCount: 1, sourcePolicy: 'REQUIRE_OFFICIAL_FOR_HIGH_RISK_FIELDS', missingProvenanceCeiling: 'OMIT', aiDerivedEvidencePenalty: true, merchantOverrideTreatment: 'REQUIRE_TRACEABLE_APPROVAL', staleEvidenceTreatment: 'REQUIRE_REVIEW' },
  explanation: { level: 'STANDARD', explainSource: true, explainConflicts: true, explainOmissions: true, explainReviewRequirement: true, explainProfileInfluence: true },
  regeneration: { policy: 'REGENERATE_SELECTED_FIELDS_ONLY', preserveApprovedContent: true, preserveLockedFields: true, fullRegenerationRequiresExplicitAction: true },
  localization: { primaryLanguage: 'en', secondaryLanguage: null, locale: 'en-US', market: 'US', measurementSystem: 'PRESERVE_SOURCE', currencyDisplay: 'PRESERVE_SOURCE', currencyCode: 'USD', spellingVariant: 'LOCALE_DEFAULT', translationPolicy: 'DISABLED', preserveIdentifiersAndUnits: true },
  toneVariation: 'STRICT_PROFILE_TONE', prohibitedActions: everyProhibitedAction,
  highRisk: { categories: everyHighRiskCategory, requireStrongerEvidence: true, requireHumanReview: true, prohibitGeneratedRegulatedClaims: true },
  humanReviewThresholds: ['ALWAYS_REVIEW', 'REVIEW_IF_UNCERTAIN', 'REVIEW_IF_HIGH_RISK', 'REVIEW_IF_CONFLICTED'],
  bulk: { maximumReviewBatchSize: 25, sampleReviewRequired: true, stopOnCriticalConflict: true, stopOnValidationFailure: true, approvalBeforeApplyToAll: true, preservePerProductEvidence: true, preventCrossProductFactReuse: true, preserveVariantBoundaries: true, preserveRegionalVariants: true, preventUnknownCategoryPackReuse: true },
  modelPolicy: { qualityTier: 'STANDARD', allowEscalation: true, maxRetries: 1, maxRegenerations: 3, preferDeterministicProcessing: true, reuseVerifiedAnalysis: true, avoidUnnecessaryAiCalls: true, approvalBeforeHighCostBulkOperation: true },
  merchantApprovalRequired: true,
};

export const listingPilotAiSafetyDefaults: Readonly<AiPolicies> = immutablePreferenceValue(aiPoliciesSchema.parse(basePolicies));

export function createAiProfile(setupMode: AiProfile['setupMode']): AiProfile {
  const policies = structuredClone(listingPilotAiSafetyDefaults) as AiPolicies;
  if (setupMode === 'BALANCED_AI') {
    policies.creativity = 'MEDIUM';
    policies.toneVariation = 'ALLOW_MINOR_VARIATION';
  }
  if (setupMode === 'CREATIVE_AI') {
    policies.creativity = 'HIGH';
    policies.toneVariation = 'ALLOW_BROAD_VARIATION';
  }
  return aiProfileDataSchema.parse({ setupMode, approved: true, policies });
}
