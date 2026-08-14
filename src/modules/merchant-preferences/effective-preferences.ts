import type { CatalogPreferenceData } from './catalog-section.ts';
import type { ListingPreferenceData, ListingRules } from './listing-standard.ts';
import { createListingProfileForStandard } from './listing-standard.ts';
import type { SeoProfile } from './seo-profile.ts';
import { resolveEffectivePublishingProfile, type EffectivePublishingProfile } from './effective-publishing-profile.ts';
import { resolveEffectiveAiProfile, type EffectiveAiProfile } from './effective-ai-profile.ts';
import { findMerchantPreferenceSection } from './business-profile.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import type {
  MerchantBusinessProfile,
  MerchantPreferenceSource,
  MerchantPreferenceValidationStatus,
} from './types.ts';

export interface EffectiveCatalogPreferences {
  readonly collections: readonly string[];
  readonly productTypes: readonly string[];
  readonly vendors: readonly string[];
  readonly merchantConfigured: boolean;
  readonly complete: boolean;
  readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly source: MerchantPreferenceSource;
  readonly sourceExplanation: string;
  readonly fingerprint: string;
  readonly issues: readonly string[];
}

export interface EffectiveMerchantPreferences {
  readonly workspaceId: string;
  readonly catalog: EffectiveCatalogPreferences;
  readonly listing: EffectiveListingPreferences;
  readonly seo: EffectiveSeoPreferences;
  readonly publishing: EffectivePublishingProfile;
  readonly ai: EffectiveAiProfile;
  readonly fingerprint: string;
}

export interface EffectiveSeoPreferences {
  readonly schemaVersion: 1;
  readonly values: SeoProfile;
  readonly sourceByRuleGroup: Readonly<Record<keyof SeoProfile['rules'], MerchantPreferenceSource>>;
  readonly merchantConfigured: boolean;
  readonly complete: boolean;
  readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly sourceExplanation: string;
  readonly pendingAnalysis: boolean;
  readonly issues: readonly string[];
  readonly fingerprint: string;
}

export interface EffectiveListingPreferences {
  readonly standardId: ListingPreferenceData['standardId'];
  readonly learningMode: ListingPreferenceData['learningMode'];
  readonly analysisStatus: ListingPreferenceData['analysisStatus'];
  readonly rules: ListingRules | null;
  readonly merchantConfigured: boolean;
  readonly complete: boolean;
  readonly validationStatus: MerchantPreferenceValidationStatus;
  readonly source: MerchantPreferenceSource;
  readonly sourceExplanation: string;
  readonly fingerprint: string;
  readonly issues: readonly string[];
}

function semanticValues(values: readonly string[]): readonly string[] {
  return Object.freeze([...values].sort((left, right) => (
    left.localeCompare(right, 'en-US', { sensitivity: 'base' })
  )));
}

export function resolveEffectiveMerchantPreferences(
  workspaceId: string,
  profile: MerchantBusinessProfile | null,
  registry: MerchantPreferenceRegistry,
): EffectiveMerchantPreferences {
  const definition = registry.get<CatalogPreferenceData>('catalog');
  const defaults = definition.defaultProvider();
  const section = findMerchantPreferenceSection<CatalogPreferenceData>(
    profile,
    'catalog',
  );
  const validMerchantSection = Boolean(
    section
    && section.data
    && section.validationStatus === 'VALID'
    && section.status !== 'INVALID',
  );
  const data = validMerchantSection && section?.data
    ? section.data
    : defaults;
  const completion = validMerchantSection && section?.data
    ? definition.completionEvaluator(section.data)
    : {
        complete: false,
        validationStatus: section?.validationStatus ?? 'VALID',
        issues: section ? ['The stored Catalog Profile is invalid.'] : [],
      };
  const catalogWithoutFingerprint = {
    collections: semanticValues(data.collections),
    productTypes: semanticValues(data.productTypes),
    vendors: semanticValues(data.vendors),
    merchantConfigured: validMerchantSection,
    complete: Boolean(
      validMerchantSection
      && section?.status === 'COMPLETE'
      && completion.complete,
    ),
    validationStatus: validMerchantSection
      ? completion.validationStatus
      : section?.validationStatus ?? 'VALID',
    source: validMerchantSection
      ? section!.source
      : 'PLATFORM_DEFAULT' as const,
    sourceExplanation: validMerchantSection
      ? 'Merchant-approved Catalog Profile values override empty platform catalog defaults.'
      : 'Empty platform catalog defaults apply until the merchant completes the Catalog Profile.',
    issues: Object.freeze([...completion.issues]),
  };
  const catalog = Object.freeze({
    ...catalogWithoutFingerprint,
    fingerprint: stableMerchantPreferenceFingerprint(
      catalogWithoutFingerprint,
    ),
  });
  const listingDefinition = registry.get<ListingPreferenceData>('listing');
  const listingSection = findMerchantPreferenceSection<ListingPreferenceData>(
    profile,
    'listing',
  );
  const validListing = Boolean(
    listingSection
    && listingSection.data
    && listingSection.validationStatus === 'VALID'
    && listingSection.status !== 'INVALID',
  );
  const listingData = validListing && listingSection?.data
    ? listingSection.data
    : listingDefinition.defaultProvider();
  const standardDefaults = createListingProfileForStandard(listingData.standardId);
  const listingCompletion = validListing && listingSection?.data
    ? listingDefinition.completionEvaluator(listingSection.data)
    : {
        complete: false,
        validationStatus: listingSection?.validationStatus ?? 'VALID',
        issues: listingSection ? ['The stored Listing Profile is invalid.'] : [],
      };
  const listingWithoutFingerprint = {
    standardId: listingData.standardId,
    learningMode: listingData.learningMode,
    analysisStatus: listingData.analysisStatus,
    rules: listingData.rules ?? standardDefaults.rules,
    merchantConfigured: validListing,
    complete: Boolean(
      validListing
      && listingSection?.status === 'COMPLETE'
      && listingCompletion.complete,
    ),
    validationStatus: validListing
      ? listingCompletion.validationStatus
      : listingSection?.validationStatus ?? 'VALID',
    source: validListing ? listingSection!.source : 'PLATFORM_DEFAULT' as const,
    sourceExplanation: validListing
      ? 'The selected Listing Standard is applied first, then merchant-approved Listing Profile customizations.'
      : 'Platform listing defaults apply until the merchant selects and saves a Listing Standard.',
    issues: Object.freeze([...listingCompletion.issues]),
  };
  const listing = Object.freeze({
    ...listingWithoutFingerprint,
    fingerprint: stableMerchantPreferenceFingerprint(listingWithoutFingerprint),
  });
  const seoDefinition = registry.get<SeoProfile>('seo');
  const seoSection = findMerchantPreferenceSection<SeoProfile>(profile, 'seo');
  const validSeo = Boolean(seoSection?.data && seoSection.validationStatus === 'VALID' && seoSection.status !== 'INVALID');
  const seoValues = validSeo && seoSection?.data ? seoSection.data : seoDefinition.defaultProvider();
  const seoCompletion = validSeo && seoSection?.data
    ? seoDefinition.completionEvaluator(seoSection.data)
    : { complete: false, validationStatus: seoSection?.validationStatus ?? 'VALID', issues: seoSection ? ['The stored SEO Profile is invalid.'] : [] };
  const seoSource = validSeo ? seoSection!.source : 'PLATFORM_DEFAULT' as const;
  const sourceByRuleGroup = Object.freeze(Object.fromEntries(
    Object.keys(seoValues.rules).map((key) => [key, seoSource]),
  ) as Record<keyof SeoProfile['rules'], MerchantPreferenceSource>);
  const seoWithoutFingerprint = {
    schemaVersion: 1 as const,
    values: seoValues,
    sourceByRuleGroup,
    merchantConfigured: validSeo,
    complete: Boolean(validSeo && seoSection?.status === 'COMPLETE' && seoCompletion.complete),
    validationStatus: validSeo ? seoCompletion.validationStatus : seoSection?.validationStatus ?? 'VALID',
    sourceExplanation: validSeo
      ? 'ListingPilot SEO safety defaults are applied first, followed by the merchant-approved SEO Profile.'
      : 'ListingPilot SEO safety defaults apply until the merchant approves an SEO Profile.',
    pendingAnalysis: seoValues.analysisStatus === 'PENDING_ANALYSIS',
    issues: Object.freeze([...seoCompletion.issues]),
  };
  const seo = Object.freeze({ ...seoWithoutFingerprint, fingerprint: stableMerchantPreferenceFingerprint(seoWithoutFingerprint) });
  const publishing = resolveEffectivePublishingProfile(profile, registry);
  const ai = resolveEffectiveAiProfile(profile, registry, {
    listingProfileEnforced: listing.merchantConfigured,
    seoProfileEnforced: seo.merchantConfigured,
    publishingApprovalRequired: publishing.policies.approval.explicitMerchantActionRequired,
  });
  return Object.freeze({
    workspaceId,
    catalog,
    listing,
    seo,
    publishing,
    ai,
    fingerprint: stableMerchantPreferenceFingerprint({
      workspaceId,
      catalog: catalog.fingerprint,
      listing: listing.fingerprint,
      seo: seo.fingerprint,
      publishing: publishing.fingerprint,
      ai: ai.fingerprint,
    }),
  });
}
