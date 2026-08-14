import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionDefinition } from './registry.ts';
import { createSeoProfile, seoProfileDataSchema, type SeoProfile } from './seo-profile.ts';

export const SEO_PREFERENCE_SCHEMA_VERSION = 1;

export const seoPreferenceSectionDefinition: MerchantPreferenceSectionDefinition<SeoProfile> = {
  sectionId: 'seo', active: true, currentSchemaVersion: SEO_PREFERENCE_SCHEMA_VERSION,
  validator: seoProfileDataSchema,
  defaultProvider: () => createSeoProfile('LISTINGPILOT_STANDARD'),
  completionEvaluator(data) {
    const parsed = seoProfileDataSchema.safeParse(data);
    return parsed.success
      ? { status: 'COMPLETE', validationStatus: 'VALID', complete: true, issues: [] }
      : { status: 'INVALID', validationStatus: 'INVALID', complete: false, issues: parsed.error.issues.map(({ message }) => message) };
  },
  serialize: (data) => seoProfileDataSchema.parse(data),
  deserialize: (payload) => seoProfileDataSchema.parse(payload),
  migrate(payload, version) {
    if (version !== 1) throw new MerchantPreferenceError('UNSUPPORTED_SECTION_VERSION', 409, `SEO preference schema version ${version} is unsupported.`);
    return { schemaVersion: 1, data: seoProfileDataSchema.parse(payload) };
  },
};
