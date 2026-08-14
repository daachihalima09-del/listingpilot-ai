import { z } from 'zod';
import { AI_PREFERENCE_SCHEMA_VERSION, createAiProfile, findMerchantPreferenceSection, type AiProfile, type MerchantPreferenceAccess } from '@/modules/merchant-preferences';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';

export const aiProfileWorkspaceSchema = z.object({ workspaceId: z.string().uuid() }).strict();
export async function getMerchantAiProfile(workspaceId: string) {
  const profile = await createServerMerchantPreferenceService().getProfile(workspaceId);
  const section = findMerchantPreferenceSection<AiProfile>(profile, 'ai');
  return section?.data ? { version: section.version, data: section.data } : null;
}
export async function getMerchantAiProfileView(workspaceId: string) {
  const service = createServerMerchantPreferenceService();
  const [profile, effective, completion] = await Promise.all([service.getProfile(workspaceId), service.getEffectivePreferences(workspaceId), service.getCompletion(workspaceId)]);
  const section = findMerchantPreferenceSection<AiProfile>(profile, 'ai');
  return { current: section?.data ? { version: section.version, data: section.data } : null, effective: effective.ai, completion };
}
export async function saveMerchantAiProfile(access: MerchantPreferenceAccess, data: AiProfile, expectedVersion: number | null) {
  return createServerMerchantPreferenceService().saveSection(access, { workspaceId: access.workspaceId, sectionId: 'ai', schemaVersion: AI_PREFERENCE_SCHEMA_VERSION, expectedVersion, source: expectedVersion === null ? 'MANUAL' : 'MERCHANT_EDIT', payload: data });
}
export { createAiProfile };
