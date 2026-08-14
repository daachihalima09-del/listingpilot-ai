import { neovixCraftRulePack } from '../packs/neovix/neovix-craft-pack.ts';
import { ListingCraftRuleRegistry } from './craft-rule-registry.ts';

export function createListingCraftRegistry(): ListingCraftRuleRegistry {
  return new ListingCraftRuleRegistry();
}

export const defaultListingCraftRegistry = createListingCraftRegistry()
  .register(neovixCraftRulePack)
  .freeze();

export function getCraftPackForListingStandard(standardId: string) {
  return defaultListingCraftRegistry.getByListingStandard(standardId);
}
