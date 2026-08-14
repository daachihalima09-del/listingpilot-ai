import { findMerchantPreferenceSection } from './business-profile.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { immutablePreferenceValue } from './immutability.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import type { MerchantBusinessProfile, MerchantPreferenceSource, MerchantPreferenceValidationStatus } from './types.ts';
import { listingPilotPublishingSafeDefaults, type PublishingPolicies, type PublishingProfile } from './publishing-profile.ts';

export const publishingPolicyGroups = ['newProductStatus', 'approval', 'existingProductUpdateMode', 'fieldPolicies', 'brandVendor', 'handle', 'variants', 'inventory', 'images', 'metafields', 'seo', 'tags', 'collections', 'failure', 'blockers'] as const;
export type PublishingPolicyGroup = typeof publishingPolicyGroups[number];

export interface EffectivePublishingProfile {
  readonly schemaVersion: 1;
  readonly setupMode: PublishingProfile['setupMode'];
  readonly analysisStatus: PublishingProfile['analysisStatus'];
  readonly policies: PublishingPolicies;
  readonly sourceByPolicyGroup: Readonly<Record<PublishingPolicyGroup, MerchantPreferenceSource>>;
  readonly merchantConfigured: boolean;
  readonly complete: boolean;
  readonly pendingAnalysis: boolean;
  readonly catalogBrandVendorConstraintApplied: boolean;
  readonly brandVendorRequiresReview: boolean;
  readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly sourceExplanation: string;
  readonly issues: readonly string[];
  readonly fingerprint: string;
}

export function resolveEffectivePublishingProfile(
  profile: MerchantBusinessProfile | null,
  registry: MerchantPreferenceRegistry,
): EffectivePublishingProfile {
  const definition = registry.get<PublishingProfile>('publishing');
  const section = findMerchantPreferenceSection<PublishingProfile>(profile, 'publishing');
  const valid = Boolean(section?.data && section.validationStatus === 'VALID' && section.status !== 'INVALID');
  const stored = valid && section?.data ? section.data : definition.defaultProvider();
  const completion = valid && section?.data
    ? definition.completionEvaluator(section.data)
    : { complete: false, validationStatus: section?.validationStatus ?? 'VALID' as const, issues: section ? ['The stored Publishing Profile is invalid.'] : [] };
  const pendingAnalysis = stored.setupMode === 'REVIEW_CURRENT_SHOPIFY_SETUP' && stored.analysisStatus === 'PENDING_ANALYSIS';
  const basePolicies = pendingAnalysis ? listingPilotPublishingSafeDefaults : stored.policies;
  const catalogConstraintApplied = basePolicies.brandVendor.policy === 'MAP_BRAND_TO_VENDOR';
  const policies = immutablePreferenceValue({
    ...structuredClone(basePolicies),
    brandVendor: catalogConstraintApplied
      ? { policy: 'REQUIRE_REVIEW' as const }
      : structuredClone(basePolicies.brandVendor),
  }) as PublishingPolicies;
  const source = valid && !pendingAnalysis ? section!.source : 'PLATFORM_DEFAULT' as const;
  const sourceByPolicyGroup = immutablePreferenceValue(Object.fromEntries(publishingPolicyGroups.map((group) => [group, source])) as Record<PublishingPolicyGroup, MerchantPreferenceSource>);
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    setupMode: stored.setupMode,
    analysisStatus: stored.analysisStatus,
    policies,
    sourceByPolicyGroup,
    merchantConfigured: valid,
    complete: Boolean(valid && section?.status === 'COMPLETE' && completion.complete),
    pendingAnalysis,
    catalogBrandVendorConstraintApplied: catalogConstraintApplied,
    brandVendorRequiresReview: policies.brandVendor.policy === 'REQUIRE_REVIEW' || policies.brandVendor.policy === 'USE_CATALOG_PROFILE_MAPPING',
    validationStatus: valid ? completion.validationStatus : section?.validationStatus ?? 'VALID' as const,
    sourceExplanation: pendingAnalysis
      ? 'ListingPilot Safe Defaults apply while review of the current Shopify setup is pending.'
      : valid
        ? 'Publishing safety defaults are applied first, followed by the merchant-approved Publishing Profile and Catalog Profile Brand/Vendor constraints.'
        : 'ListingPilot Safe Defaults apply until the merchant saves a Publishing Profile.',
    issues: immutablePreferenceValue([...completion.issues]),
  };
  return immutablePreferenceValue({ ...withoutFingerprint, fingerprint: stableMerchantPreferenceFingerprint(withoutFingerprint) });
}
