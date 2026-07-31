import type { CatalogPreferenceData } from './catalog-section.ts';
import type { ListingPreferenceData, ListingRules } from './listing-standard.ts';
import { createListingProfileForStandard } from './listing-standard.ts';
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
  return Object.freeze({
    workspaceId,
    catalog,
    listing,
    fingerprint: stableMerchantPreferenceFingerprint({
      workspaceId,
      catalog: catalog.fingerprint,
      listing: listing.fingerprint,
    }),
  });
}
