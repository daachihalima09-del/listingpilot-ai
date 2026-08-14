import { findMerchantPreferenceSection } from './business-profile.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { immutablePreferenceValue } from './immutability.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import type { MerchantBusinessProfile, MerchantPreferenceSource, MerchantPreferenceValidationStatus } from './types.ts';
import { listingPilotAiSafetyDefaults, type AiPolicies, type AiProfile } from './ai-profile.ts';

export const aiPolicyGroups = ['factualStrictness', 'creativity', 'uncertainty', 'missingInformation', 'conflicts', 'evidence', 'explanation', 'regeneration', 'localization', 'toneVariation', 'prohibitedActions', 'highRisk', 'humanReviewThresholds', 'bulk', 'modelPolicy', 'merchantApprovalRequired'] as const;
export type AiPolicyGroup = typeof aiPolicyGroups[number];
export interface AiResolverConstraints { readonly listingProfileEnforced?: boolean; readonly seoProfileEnforced?: boolean; readonly publishingApprovalRequired?: boolean; readonly productIntelligenceHighRisk?: boolean; readonly productIntelligenceProhibitedActions?: readonly AiPolicies['prohibitedActions'][number][]; }
export interface EffectiveAiProfile {
  readonly schemaVersion: 1; readonly setupMode: AiProfile['setupMode']; readonly policies: AiPolicies;
  readonly sourceByPolicyGroup: Readonly<Record<AiPolicyGroup, MerchantPreferenceSource>>;
  readonly merchantConfigured: boolean; readonly complete: boolean; readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly listingProfileConstraintApplied: boolean; readonly seoProfileConstraintApplied: boolean; readonly publishingApprovalConstraintApplied: boolean; readonly productIntelligenceConstraintApplied: boolean;
  readonly sourceExplanation: string; readonly issues: readonly string[]; readonly fingerprint: string;
}

export function resolveEffectiveAiProfile(profile: MerchantBusinessProfile | null, registry: MerchantPreferenceRegistry, constraints: AiResolverConstraints = {}): EffectiveAiProfile {
  const definition = registry.get<AiProfile>('ai');
  const section = findMerchantPreferenceSection<AiProfile>(profile, 'ai');
  const valid = Boolean(section?.data && section.validationStatus === 'VALID' && section.status !== 'INVALID');
  const stored = valid && section?.data ? section.data : definition.defaultProvider();
  const completion = valid && section?.data ? definition.completionEvaluator(section.data) : { complete: false, validationStatus: section?.validationStatus ?? 'VALID' as const, issues: section ? ['The stored AI Profile is invalid.'] : [] };
  const policies = structuredClone(stored.policies);
  const requiredProhibitions = new Set([...listingPilotAiSafetyDefaults.prohibitedActions, ...(constraints.productIntelligenceProhibitedActions ?? [])]);
  policies.prohibitedActions = [...requiredProhibitions] as AiPolicies['prohibitedActions'];
  policies.highRisk.requireStrongerEvidence = true; policies.highRisk.requireHumanReview = true; policies.highRisk.prohibitGeneratedRegulatedClaims = true;
  policies.merchantApprovalRequired = true;
  if (!policies.humanReviewThresholds.includes('REVIEW_IF_HIGH_RISK')) policies.humanReviewThresholds.push('REVIEW_IF_HIGH_RISK');
  if (!policies.humanReviewThresholds.includes('REVIEW_IF_CONFLICTED')) policies.humanReviewThresholds.push('REVIEW_IF_CONFLICTED');
  if (constraints.publishingApprovalRequired && !policies.humanReviewThresholds.includes('ALWAYS_REVIEW')) policies.humanReviewThresholds.push('ALWAYS_REVIEW');
  if (constraints.listingProfileEnforced) policies.toneVariation = policies.toneVariation === 'ALLOW_BROAD_VARIATION' ? 'ALLOW_MINOR_VARIATION' : policies.toneVariation;
  if (constraints.seoProfileEnforced && policies.factualStrictness !== 'VERIFIED_ONLY') policies.factualStrictness = 'VERIFIED_ONLY';
  const immutablePolicies = immutablePreferenceValue(policies) as AiPolicies;
  const source = valid ? section!.source : 'PLATFORM_DEFAULT' as const;
  const withoutFingerprint = {
    schemaVersion: 1 as const, setupMode: stored.setupMode, policies: immutablePolicies,
    sourceByPolicyGroup: immutablePreferenceValue(Object.fromEntries(aiPolicyGroups.map((group) => [group, source])) as Record<AiPolicyGroup, MerchantPreferenceSource>),
    merchantConfigured: valid, complete: Boolean(valid && section?.status === 'COMPLETE' && completion.complete), validationStatus: valid ? completion.validationStatus : section?.validationStatus ?? 'VALID' as const,
    listingProfileConstraintApplied: Boolean(constraints.listingProfileEnforced), seoProfileConstraintApplied: Boolean(constraints.seoProfileEnforced), publishingApprovalConstraintApplied: Boolean(constraints.publishingApprovalRequired), productIntelligenceConstraintApplied: Boolean(constraints.productIntelligenceHighRisk || constraints.productIntelligenceProhibitedActions?.length),
    sourceExplanation: valid ? 'AI safety defaults are applied first, followed by merchant preferences and non-negotiable Listing, SEO, Publishing, Product Truth and Product Intelligence constraints.' : 'ListingPilot Safe AI defaults apply until the merchant saves an AI Profile.',
    issues: immutablePreferenceValue([...completion.issues]),
  };
  return immutablePreferenceValue({ ...withoutFingerprint, fingerprint: stableMerchantPreferenceFingerprint(withoutFingerprint) });
}
