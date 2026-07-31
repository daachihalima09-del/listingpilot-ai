import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionDefinition } from './registry.ts';
import {
  listingProfileDataSchema,
  type ListingPreferenceData,
} from './listing-standard.ts';

export const LISTING_PREFERENCE_SCHEMA_VERSION = 1;

export const listingPreferenceSectionDefinition:
MerchantPreferenceSectionDefinition<ListingPreferenceData> = {
  sectionId: 'listing',
  active: true,
  currentSchemaVersion: LISTING_PREFERENCE_SCHEMA_VERSION,
  validator: listingProfileDataSchema,
  defaultProvider: () => ({
    standardId: 'CUSTOM',
    learningMode: 'STANDARD',
    analysisStatus: 'NOT_REQUIRED',
    configurationStatus: 'STANDARD_SELECTED',
    rules: null,
  }),
  completionEvaluator(data) {
    const parsed = listingProfileDataSchema.safeParse(data);
    if (!parsed.success) {
      return {
        status: 'INVALID',
        validationStatus: 'INVALID',
        complete: false,
        issues: parsed.error.issues.map(({ message }) => message),
      };
    }
    if (parsed.data.learningMode === 'LEARN_FROM_STORE') {
      return {
        status: 'COMPLETE',
        validationStatus: 'VALID',
        complete: true,
        issues: [],
      };
    }
    if (parsed.data.configurationStatus !== 'CONFIGURED' || !parsed.data.rules) {
      return {
        status: 'IN_PROGRESS',
        validationStatus: 'VALID',
        complete: false,
        issues: ['Save the configured listing rules to complete this profile.'],
      };
    }
    return {
      status: 'COMPLETE',
      validationStatus: 'VALID',
      complete: true,
      issues: [],
    };
  },
  serialize(data) {
    return listingProfileDataSchema.parse(data);
  },
  deserialize(payload) {
    return listingProfileDataSchema.parse(payload);
  },
  migrate(payload, fromSchemaVersion) {
    if (fromSchemaVersion !== LISTING_PREFERENCE_SCHEMA_VERSION) {
      throw new MerchantPreferenceError(
        'UNSUPPORTED_SECTION_VERSION',
        409,
        `Listing preference schema version ${fromSchemaVersion} is unsupported.`,
      );
    }
    return {
      schemaVersion: LISTING_PREFERENCE_SCHEMA_VERSION,
      data: listingProfileDataSchema.parse(payload),
    };
  },
};
