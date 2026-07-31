import type { MerchantBusinessProfile } from './types.ts';
import type { MerchantPreferenceRegistry } from './registry.ts';
import type { MerchantPreferenceSectionId } from './section-ids.ts';
import { findMerchantPreferenceSection } from './business-profile.ts';
import type { ListingPreferenceData } from './listing-standard.ts';

export interface MerchantBusinessProfileCompletion {
  readonly status: 'COMPLETE' | 'INCOMPLETE' | 'NEEDS_REVIEW' | 'INVALID';
  readonly completeEnoughToProceed: boolean;
  readonly incompleteRequiredSections: readonly MerchantPreferenceSectionId[];
  readonly sectionsRequiringReview: readonly MerchantPreferenceSectionId[];
  readonly invalidSections: readonly MerchantPreferenceSectionId[];
  readonly nextRequiredSection: MerchantPreferenceSectionId | null;
  readonly catalogComplete: boolean;
  readonly listingStandardSelected: boolean;
  readonly listingComplete: boolean;
  readonly canCreateProject: boolean;
  readonly canPublishSafely: boolean;
}

export function evaluateMerchantBusinessProfileCompletion(
  profile: MerchantBusinessProfile | null,
  registry: MerchantPreferenceRegistry,
): MerchantBusinessProfileCompletion {
  const incomplete: MerchantPreferenceSectionId[] = [];
  const review: MerchantPreferenceSectionId[] = [];
  const invalid: MerchantPreferenceSectionId[] = [];

  for (const sectionId of registry.activeSectionIds()) {
    const section = findMerchantPreferenceSection(profile, sectionId);
    if (!section) {
      incomplete.push(sectionId);
      continue;
    }
    if (
      section.status === 'INVALID'
      || section.validationStatus === 'INVALID'
      || section.data === null
    ) {
      invalid.push(sectionId);
      continue;
    }
    if (section.status === 'NEEDS_REVIEW') {
      review.push(sectionId);
      continue;
    }
    const definition = registry.get(sectionId);
    const completion = definition.completionEvaluator(section.data);
    if (
      section.status !== 'COMPLETE'
      || section.validationStatus !== 'VALID'
      || !completion.complete
    ) {
      incomplete.push(sectionId);
    }
  }

  const complete = incomplete.length === 0
    && review.length === 0
    && invalid.length === 0;
  const catalogComplete = !incomplete.includes('catalog')
    && !review.includes('catalog')
    && !invalid.includes('catalog');
  const listing = findMerchantPreferenceSection<ListingPreferenceData>(
    profile,
    'listing',
  );
  const listingStandardSelected = Boolean(
    listing?.data && listing.validationStatus === 'VALID',
  );
  const listingComplete = !incomplete.includes('listing')
    && !review.includes('listing')
    && !invalid.includes('listing');
  return Object.freeze({
    status: invalid.length
      ? 'INVALID'
      : review.length
        ? 'NEEDS_REVIEW'
        : complete
          ? 'COMPLETE'
          : 'INCOMPLETE',
    completeEnoughToProceed: complete,
    incompleteRequiredSections: Object.freeze(incomplete),
    sectionsRequiringReview: Object.freeze(review),
    invalidSections: Object.freeze(invalid),
    nextRequiredSection: invalid[0] ?? review[0] ?? incomplete[0] ?? null,
    catalogComplete,
    listingStandardSelected,
    listingComplete,
    canCreateProject: catalogComplete && listingComplete,
    canPublishSafely: catalogComplete && listingComplete,
  });
}
