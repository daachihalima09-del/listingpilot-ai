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
  | 'listing_profile.completed'
  | 'seo_profile.created'
  | 'seo_profile.mode_selected'
  | 'seo_profile.updated'
  | 'seo_profile.completed'
  | 'seo_profile.review_requested'
  | 'seo_profile.review_required'
  | 'publishing_profile.created'
  | 'publishing_profile.mode_selected'
  | 'publishing_profile.updated'
  | 'publishing_profile.completed'
  | 'publishing_profile.review_requested'
  | 'publishing_profile.review_required'
  | 'publishing_profile.reset_to_defaults'
  | 'ai_profile.created'
  | 'ai_profile.mode_selected'
  | 'ai_profile.updated'
  | 'ai_profile.completed'
  | 'ai_profile.review_required'
  | 'ai_profile.reset_to_defaults';

export interface MerchantPreferenceAuditEvent {
  action: MerchantPreferenceAuditAction;
  metadata: {
    sectionId?: MerchantPreferenceSectionId;
    previousSectionVersion?: number | null;
    newSectionVersion?: number;
    source?: MerchantPreferenceSource;
    status?: MerchantPreferenceSectionStatus;
    changedFields?: readonly string[];
    setupMode?: string;
    analysisStatus?: string;
    completionStatus?: string;
    creativityLevel?: string;
    factualStrictness?: string;
    qualityTier?: string;
    reviewThresholdCount?: number;
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
  changedFields?: readonly string[];
  listingEvent?: 'STANDARD_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED';
  seoEvent?: 'MODE_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED' | 'REVIEW_REQUESTED' | 'REVIEW_REQUIRED';
  publishingEvent?: 'MODE_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED' | 'REVIEW_REQUESTED' | 'REVIEW_REQUIRED' | 'RESET_TO_DEFAULTS';
  publishingMetadata?: Readonly<{ setupMode?: string; analysisStatus?: string; completionStatus?: string }>;
  aiEvent?: 'MODE_SELECTED' | 'CREATED' | 'UPDATED' | 'COMPLETED' | 'REVIEW_REQUIRED' | 'RESET_TO_DEFAULTS';
  aiMetadata?: Readonly<{ setupMode?: string; completionStatus?: string; creativityLevel?: string; factualStrictness?: string; qualityTier?: string; reviewThresholdCount?: number }>;
}): MerchantPreferenceAuditEvent {
  const aiAction = input.aiEvent
    ? ({ MODE_SELECTED: 'ai_profile.mode_selected', CREATED: 'ai_profile.created', UPDATED: 'ai_profile.updated', COMPLETED: 'ai_profile.completed', REVIEW_REQUIRED: 'ai_profile.review_required', RESET_TO_DEFAULTS: 'ai_profile.reset_to_defaults' } as const)[input.aiEvent]
    : null;
  const publishingAction = input.publishingEvent
    ? ({ MODE_SELECTED: 'publishing_profile.mode_selected', CREATED: 'publishing_profile.created', UPDATED: 'publishing_profile.updated', COMPLETED: 'publishing_profile.completed', REVIEW_REQUESTED: 'publishing_profile.review_requested', REVIEW_REQUIRED: 'publishing_profile.review_required', RESET_TO_DEFAULTS: 'publishing_profile.reset_to_defaults' } as const)[input.publishingEvent]
    : null;
  const seoAction = input.seoEvent
    ? ({ MODE_SELECTED: 'seo_profile.mode_selected', CREATED: 'seo_profile.created', UPDATED: 'seo_profile.updated', COMPLETED: 'seo_profile.completed', REVIEW_REQUESTED: 'seo_profile.review_requested', REVIEW_REQUIRED: 'seo_profile.review_required' } as const)[input.seoEvent]
    : null;
  const action = aiAction ?? publishingAction ?? seoAction ?? (input.sectionId === 'listing' && input.listingEvent === 'STANDARD_SELECTED'
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
          : 'merchant_profile.section_updated');
  return {
    action,
    metadata: {
      sectionId: input.sectionId,
      previousSectionVersion: input.previousVersion,
      newSectionVersion: input.newVersion,
      source: input.source,
      status: input.status,
      changedFields: input.changedFields ?? ['payload', 'completion', 'source'],
      ...(input.publishingMetadata ?? {}),
      ...(input.aiMetadata ?? {}),
      ...(input.valueCounts ? { valueCounts: input.valueCounts } : {}),
    },
  };
}
