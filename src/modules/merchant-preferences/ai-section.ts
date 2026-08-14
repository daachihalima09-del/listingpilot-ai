import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionDefinition } from './registry.ts';
import { aiProfileDataSchema, createAiProfile, type AiProfile } from './ai-profile.ts';

export const AI_PREFERENCE_SCHEMA_VERSION = 1;

export const aiPreferenceSectionDefinition: MerchantPreferenceSectionDefinition<AiProfile> = {
  sectionId: 'ai', active: true, currentSchemaVersion: AI_PREFERENCE_SCHEMA_VERSION,
  validator: aiProfileDataSchema,
  defaultProvider: () => createAiProfile('LISTINGPILOT_SAFE_AI'),
  completionEvaluator(data) {
    const parsed = aiProfileDataSchema.safeParse(data);
    return parsed.success
      ? { status: 'COMPLETE', validationStatus: 'VALID', complete: true, issues: [] }
      : { status: 'INVALID', validationStatus: 'INVALID', complete: false, issues: parsed.error.issues.map(({ message }) => message) };
  },
  serialize: (data) => aiProfileDataSchema.parse(data),
  deserialize: (payload) => aiProfileDataSchema.parse(payload),
  migrate(payload, version) {
    if (version !== AI_PREFERENCE_SCHEMA_VERSION) throw new MerchantPreferenceError('UNSUPPORTED_SECTION_VERSION', 409, `AI preference schema version ${version} is unsupported.`);
    return { schemaVersion: AI_PREFERENCE_SCHEMA_VERSION, data: aiProfileDataSchema.parse(payload) };
  },
};
