import { z } from 'zod';

export const merchantPreferenceSectionIds = [
  'catalog',
  'listing',
  'seo',
  'publishing',
  'ai',
] as const;

export const activeMerchantPreferenceSectionIds = ['catalog', 'listing'] as const;

export const reservedMerchantPreferenceSectionIds = [
  'seo',
  'publishing',
  'ai',
] as const;

export const merchantPreferenceSectionIdSchema = z.enum(
  merchantPreferenceSectionIds,
);

export type MerchantPreferenceSectionId =
  z.infer<typeof merchantPreferenceSectionIdSchema>;

export type ActiveMerchantPreferenceSectionId =
  (typeof activeMerchantPreferenceSectionIds)[number];

export function isActiveMerchantPreferenceSection(
  sectionId: MerchantPreferenceSectionId,
): sectionId is ActiveMerchantPreferenceSectionId {
  return activeMerchantPreferenceSectionIds.includes(
    sectionId as ActiveMerchantPreferenceSectionId,
  );
}
