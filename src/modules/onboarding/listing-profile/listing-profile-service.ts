import { z } from 'zod';
import {
  createListingProfileForStandard,
  findMerchantPreferenceSection,
  LISTING_PREFERENCE_SCHEMA_VERSION,
  type ListingPreferenceData,
  type MerchantPreferenceAccess,
} from '@/modules/merchant-preferences';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';

export interface MerchantListingProfileDto {
  readonly version: number;
  readonly data: ListingPreferenceData;
}

export const listingProfileWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict();

export async function getMerchantListingProfile(
  workspaceId: string,
): Promise<MerchantListingProfileDto | null> {
  const profile = await createServerMerchantPreferenceService()
    .getProfile(workspaceId);
  const section = findMerchantPreferenceSection<ListingPreferenceData>(
    profile,
    'listing',
  );
  return section?.data
    ? { version: section.version, data: section.data }
    : null;
}

export async function selectListingStandard(
  access: MerchantPreferenceAccess,
  standardId: ListingPreferenceData['standardId'],
  expectedVersion: number | null,
) {
  return createServerMerchantPreferenceService().saveSection(access, {
    workspaceId: access.workspaceId,
    sectionId: 'listing',
    schemaVersion: LISTING_PREFERENCE_SCHEMA_VERSION,
    expectedVersion,
    source: 'MANUAL',
    payload: createListingProfileForStandard(standardId),
  });
}

export async function saveMerchantListingProfile(
  access: MerchantPreferenceAccess,
  expectedVersion: number,
  data: ListingPreferenceData,
) {
  return createServerMerchantPreferenceService().saveSection(access, {
    workspaceId: access.workspaceId,
    sectionId: 'listing',
    schemaVersion: LISTING_PREFERENCE_SCHEMA_VERSION,
    expectedVersion,
    source: 'MERCHANT_EDIT',
    payload: {
      ...data,
      configurationStatus: 'CONFIGURED',
    },
  });
}
