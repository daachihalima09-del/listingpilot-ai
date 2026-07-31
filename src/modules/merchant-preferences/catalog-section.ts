import type {
  MerchantCatalogProfileInput,
} from '../onboarding/catalog-profile/validation.ts';
import {
  merchantCatalogProfileInputSchema,
} from '../onboarding/catalog-profile/validation.ts';
import type {
  MerchantCatalogProfileRecord,
} from '../onboarding/catalog-profile/types.ts';
import {
  profileRecordToDto,
} from '../onboarding/catalog-profile/validation.ts';
import { MerchantPreferenceError } from './errors.ts';
import type { MerchantPreferenceSectionDefinition } from './registry.ts';
import type {
  MerchantPreferenceSectionRecord,
  MerchantPreferenceSource,
} from './types.ts';
import { stableMerchantPreferenceFingerprint } from './fingerprint.ts';

export const CATALOG_PREFERENCE_SCHEMA_VERSION = 1;

export type CatalogPreferenceData = MerchantCatalogProfileInput;

export const catalogPreferenceSectionDefinition:
MerchantPreferenceSectionDefinition<CatalogPreferenceData> = {
  sectionId: 'catalog',
  active: true,
  currentSchemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
  validator: merchantCatalogProfileInputSchema,
  defaultProvider: () => ({
    setupMode: 'MANUAL',
    collections: [],
    productTypes: [],
    vendors: [],
  }),
  completionEvaluator(data) {
    const parsed = merchantCatalogProfileInputSchema.safeParse(data);
    return parsed.success
      ? {
          status: 'COMPLETE',
          validationStatus: 'VALID',
          complete: true,
          issues: [],
        }
      : {
          status: 'INVALID',
          validationStatus: 'INVALID',
          complete: false,
          issues: parsed.error.issues.map(({ message }) => message),
        };
  },
  serialize(data) {
    return merchantCatalogProfileInputSchema.parse(data);
  },
  deserialize(payload) {
    return merchantCatalogProfileInputSchema.parse(payload);
  },
  migrate(payload, fromSchemaVersion) {
    if (fromSchemaVersion !== CATALOG_PREFERENCE_SCHEMA_VERSION) {
      throw new MerchantPreferenceError(
        'UNSUPPORTED_SECTION_VERSION',
        409,
        `Catalog preference schema version ${fromSchemaVersion} is unsupported.`,
      );
    }
    return {
      schemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
      data: merchantCatalogProfileInputSchema.parse(payload),
    };
  },
};

export function catalogPreferenceSource(
  setupMode: CatalogPreferenceData['setupMode'],
  existing = false,
): MerchantPreferenceSource {
  if (existing) return 'MERCHANT_EDIT';
  return setupMode === 'SHOPIFY_IMPORT' ? 'SHOPIFY_IMPORT' : 'MANUAL';
}

export function catalogProfileRecordToPreferenceSection(
  profile: MerchantCatalogProfileRecord,
): MerchantPreferenceSectionRecord {
  const dto = profileRecordToDto(profile);
  const payload: CatalogPreferenceData = {
    setupMode: dto.setupMode,
    collections: dto.collections,
    productTypes: dto.productTypes,
    vendors: dto.vendors,
  };
  return {
    id: `legacy-catalog:${profile.id}`,
    workspaceId: profile.workspaceId,
    sectionId: 'catalog',
    schemaVersion: CATALOG_PREFERENCE_SCHEMA_VERSION,
    version: profile.version,
    status: 'COMPLETE',
    validationStatus: 'VALID',
    source: profile.setupMode,
    payload,
    fingerprint: stableMerchantPreferenceFingerprint(payload),
    metadata: {
      adaptedFrom: 'MerchantCatalogProfile',
      legacyProfileId: profile.id,
    },
    completedAt: profile.completedAt,
    createdAt: profile.completedAt,
    updatedAt: profile.updatedAt,
  };
}
