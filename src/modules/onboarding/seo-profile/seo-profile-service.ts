import { z } from 'zod';
import {
  createSeoProfile,
  findMerchantPreferenceSection,
  SEO_PREFERENCE_SCHEMA_VERSION,
  type MerchantPreferenceAccess,
  type SeoProfile,
} from '@/modules/merchant-preferences';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';

export const seoProfileWorkspaceSchema = z.object({ workspaceId: z.string().uuid() }).strict();

export async function getMerchantSeoProfile(workspaceId: string) {
  const profile = await createServerMerchantPreferenceService().getProfile(workspaceId);
  const section = findMerchantPreferenceSection<SeoProfile>(profile, 'seo');
  return section?.data ? { version: section.version, data: section.data } : null;
}

export async function getMerchantSeoProfileView(workspaceId: string) {
  const service = createServerMerchantPreferenceService();
  const [profile, effective, completion] = await Promise.all([
    service.getProfile(workspaceId),
    service.getEffectivePreferences(workspaceId),
    service.getCompletion(workspaceId),
  ]);
  const section = findMerchantPreferenceSection<SeoProfile>(profile, 'seo');
  return {
    current: section?.data
      ? { version: section.version, data: section.data }
      : null,
    effective: effective.seo,
    completion,
  };
}

export async function saveMerchantSeoProfile(
  access: MerchantPreferenceAccess,
  data: SeoProfile,
  expectedVersion: number | null,
) {
  return createServerMerchantPreferenceService().saveSection(access, {
    workspaceId: access.workspaceId,
    sectionId: 'seo', schemaVersion: SEO_PREFERENCE_SCHEMA_VERSION,
    expectedVersion, source: expectedVersion === null ? 'MANUAL' : 'MERCHANT_EDIT', payload: data,
  });
}

export { createSeoProfile };
