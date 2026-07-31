import type {
  MerchantPreferenceSectionStatus,
  MerchantPreferenceSource,
} from './types.ts';
import type { MerchantPreferenceSectionId } from './section-ids.ts';

export type MerchantPreferenceAuditAction =
  | 'merchant_profile.created'
  | 'merchant_profile.section_created'
  | 'merchant_profile.section_updated'
  | 'merchant_profile.section_completed'
  | 'merchant_profile.section_review_required'
  | 'merchant_profile.catalog_imported'
  | 'listing_profile.created'
  | 'listing_profile.standard_selected'
  | 'listing_profile.updated'
  | 'listing_profile.completed';

export interface MerchantPreferenceAuditEvent {
  action: MerchantPreferenceAuditAction;
  metadata: {
    sectionId?: MerchantPreferenceSectionId;
    previousSectionVersion?: number | null;
    newSectionVersion?: number;
    source?: MerchantPreferenceSource;
    status?: MerchantPreferenceSectionStatus;
    changedFields?: readonly string[];
    valueCounts?: {
      collections: number;
      productTypes: number;
      vendors: number;
    };
  };
}

export function merchantProfileCreatedAuditEvent():
MerchantPreferenceAuditEvent {
  return {
    action: 'merchant_profile.created',
    metadata: {},
  };
}

export function preferenceSectionAuditEvent(input: {
  sectionId: MerchantPreferenceSectionId;
  source: MerchantPreferenceSource;
  previousVersion: number | null;
  previousStatus?: MerchantPreferenceSectionStatus | null;
  newVersion: number;
  status: MerchantPreferenceSectionStatus;
  valueCounts?: {
    collections: number;
    productTypes: number;
    vendors: number;
  };
  listingEvent?: 'STANDARD_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED';
}): MerchantPreferenceAuditEvent {
  const action = input.sectionId === 'listing' && input.listingEvent === 'STANDARD_SELECTED'
    ? 'listing_profile.standard_selected'
    : input.sectionId === 'listing' && input.listingEvent === 'CREATED'
      ? 'listing_profile.created'
      : input.sectionId === 'listing' && input.listingEvent === 'COMPLETED'
        ? 'listing_profile.completed'
        : input.sectionId === 'listing' && input.listingEvent === 'UPDATED'
          ? 'listing_profile.updated'
          : input.source === 'SHOPIFY_IMPORT' && input.previousVersion === null
    ? 'merchant_profile.catalog_imported'
    : input.previousVersion === null
      ? 'merchant_profile.section_created'
      : input.status === 'NEEDS_REVIEW'
        ? 'merchant_profile.section_review_required'
        : input.previousStatus !== 'COMPLETE' && input.status === 'COMPLETE'
          ? 'merchant_profile.section_completed'
          : 'merchant_profile.section_updated';
  return {
    action,
    metadata: {
      sectionId: input.sectionId,
      previousSectionVersion: input.previousVersion,
      newSectionVersion: input.newVersion,
      source: input.source,
      status: input.status,
      changedFields: ['payload', 'completion', 'source'],
      ...(input.valueCounts ? { valueCounts: input.valueCounts } : {}),
    },
  };
}
