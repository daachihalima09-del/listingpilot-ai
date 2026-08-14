import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionDefinition } from './registry.ts';
import { createPublishingProfile, publishingProfileDataSchema, type PublishingProfile } from './publishing-profile.ts';

export const PUBLISHING_PREFERENCE_SCHEMA_VERSION = 1;

export const publishingPreferenceSectionDefinition: MerchantPreferenceSectionDefinition<PublishingProfile> = {
  sectionId: 'publishing',
  active: true,
  currentSchemaVersion: PUBLISHING_PREFERENCE_SCHEMA_VERSION,
  validator: publishingProfileDataSchema,
  defaultProvider: () => createPublishingProfile('LISTINGPILOT_SAFE_DEFAULTS'),
  completionEvaluator(data) {
    const parsed = publishingProfileDataSchema.safeParse(data);
    return parsed.success
      ? { status: 'COMPLETE', validationStatus: 'VALID', complete: true, issues: [] }
      : { status: 'INVALID', validationStatus: 'INVALID', complete: false, issues: parsed.error.issues.map(({ message }) => message) };
  },
  serialize: (data) => publishingProfileDataSchema.parse(data),
  deserialize: (payload) => publishingProfileDataSchema.parse(payload),
  migrate(payload, version) {
    if (version !== PUBLISHING_PREFERENCE_SCHEMA_VERSION) throw new MerchantPreferenceError('UNSUPPORTED_SECTION_VERSION', 409, `Publishing preference schema version ${version} is unsupported.`);
    return { schemaVersion: PUBLISHING_PREFERENCE_SCHEMA_VERSION, data: publishingProfileDataSchema.parse(payload) };
  },
};
