import { z } from 'zod';
import {
  createPublishingProfile,
  findMerchantPreferenceSection,
  PUBLISHING_PREFERENCE_SCHEMA_VERSION,
  type MerchantPreferenceAccess,
  type PublishingProfile,
} from '@/modules/merchant-preferences';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';

export const publishingProfileWorkspaceSchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function getMerchantPublishingProfile(workspaceId: string) {
  const profile = await createServerMerchantPreferenceService().getProfile(workspaceId);
  const section = findMerchantPreferenceSection<PublishingProfile>(profile, 'publishing');
  return section?.data ? { version: section.version, data: section.data } : null;
}

export async function getMerchantPublishingProfileView(workspaceId: string) {
  const service = createServerMerchantPreferenceService();
  const [profile, effective, completion] = await Promise.all([
    service.getProfile(workspaceId),
    service.getEffectivePreferences(workspaceId),
    service.getCompletion(workspaceId),
  ]);
  const section = findMerchantPreferenceSection<PublishingProfile>(profile, 'publishing');
  return {
    current: section?.data ? { version: section.version, data: section.data } : null,
    effective: effective.publishing,
    completion,
  };
}

export async function saveMerchantPublishingProfile(access: MerchantPreferenceAccess, data: PublishingProfile, expectedVersion: number | null) {
  return createServerMerchantPreferenceService().saveSection(access, {
    workspaceId: access.workspaceId,
    sectionId: 'publishing',
    schemaVersion: PUBLISHING_PREFERENCE_SCHEMA_VERSION,
    expectedVersion,
    source: expectedVersion === null ? 'MANUAL' : 'MERCHANT_EDIT',
    payload: data,
  });
}

export { createPublishingProfile };
