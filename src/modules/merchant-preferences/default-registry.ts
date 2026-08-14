import { catalogPreferenceSectionDefinition } from './catalog-section.ts';
import { listingPreferenceSectionDefinition } from './listing-section.ts';
import { seoPreferenceSectionDefinition } from './seo-section.ts';
import { publishingPreferenceSectionDefinition } from './publishing-section.ts';
import { aiPreferenceSectionDefinition } from './ai-section.ts';
import { MerchantPreferenceRegistry } from './registry.ts';

export function createMerchantPreferenceRegistry():
MerchantPreferenceRegistry {
  return new MerchantPreferenceRegistry()
    .register(catalogPreferenceSectionDefinition)
    .register(listingPreferenceSectionDefinition)
    .register(seoPreferenceSectionDefinition)
    .register(publishingPreferenceSectionDefinition)
    .register(aiPreferenceSectionDefinition);
}
