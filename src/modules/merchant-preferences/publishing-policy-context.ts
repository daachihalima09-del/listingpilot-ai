import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import { immutablePreferenceValue } from './immutability.ts';
import { listingPilotPublishingSafeDefaults, type PublishingPolicies } from './publishing-profile.ts';
import type { EffectivePublishingProfile } from './effective-publishing-profile.ts';

export interface PublishingPolicyContext {
  readonly schemaVersion: 1;
  readonly profileVersion: 1;
  readonly productStatusPolicy: PublishingPolicies['newProductStatus'];
  readonly approval: PublishingPolicies['approval'];
  readonly updatePolicy: PublishingPolicies['existingProductUpdateMode'];
  readonly fieldPolicies: PublishingPolicies['fieldPolicies'];
  readonly handlePolicy: PublishingPolicies['handle'];
  readonly variantPolicy: PublishingPolicies['variants'];
  readonly inventoryPolicy: PublishingPolicies['inventory'];
  readonly imagePolicy: PublishingPolicies['images'];
  readonly metafieldPolicy: PublishingPolicies['metafields'];
  readonly seoPolicy: PublishingPolicies['seo'];
  readonly tagPolicy: PublishingPolicies['tags'];
  readonly collectionPolicy: PublishingPolicies['collections'];
  readonly failurePolicy: PublishingPolicies['failure'];
  readonly blockerPolicy: PublishingPolicies['blockers'];
  readonly categoryPackAbsenceBlocks: false;
  readonly shopifyMutationAllowed: false;
  readonly fingerprint: string;
}

export function createPublishingPolicyContext(effective?: EffectivePublishingProfile | null): PublishingPolicyContext {
  const policies = effective?.policies ?? listingPilotPublishingSafeDefaults;
  const values = {
    schemaVersion: 1 as const,
    profileVersion: 1 as const,
    productStatusPolicy: policies.newProductStatus,
    approval: structuredClone(policies.approval),
    updatePolicy: policies.existingProductUpdateMode,
    fieldPolicies: structuredClone(policies.fieldPolicies),
    handlePolicy: structuredClone(policies.handle),
    variantPolicy: structuredClone(policies.variants),
    inventoryPolicy: structuredClone(policies.inventory),
    imagePolicy: structuredClone(policies.images),
    metafieldPolicy: structuredClone(policies.metafields),
    seoPolicy: structuredClone(policies.seo),
    tagPolicy: structuredClone(policies.tags),
    collectionPolicy: structuredClone(policies.collections),
    failurePolicy: structuredClone(policies.failure),
    blockerPolicy: structuredClone(policies.blockers),
    categoryPackAbsenceBlocks: false as const,
    shopifyMutationAllowed: false as const,
  };
  return immutablePreferenceValue({ ...values, fingerprint: stableMerchantPreferenceFingerprint(values) });
}
