import { catalogPreferenceSectionDefinition } from './catalog-section.ts';
import { listingPreferenceSectionDefinition } from './listing-section.ts';
import { MerchantPreferenceRegistry } from './registry.ts';

export function createMerchantPreferenceRegistry():
MerchantPreferenceRegistry {
  return new MerchantPreferenceRegistry()
    .register(catalogPreferenceSectionDefinition)
    .register(listingPreferenceSectionDefinition);
}
