import { immutableCopy } from '../intelligence/domain/immutability.ts';
import type { CraftInstructionProjection, ListingCraftRulePack } from './domain/contracts.ts';

export function projectCraftPack(pack: ListingCraftRulePack): CraftInstructionProjection {
  return immutableCopy({
    packId: pack.id,
    packVersion: pack.version,
    displayName: pack.displayName,
    titleCraftRules: pack.titleRules,
    specificationCraftRules: pack.specificationRules,
    overviewCraftRules: pack.overviewRules,
    featureCraftRules: pack.featureRules,
    duplicationRules: pack.duplicationRules,
    wordingRules: pack.wordingRules,
    identityRules: pack.identityRules,
    categoryCraftGuidance: pack.categoryIntegration,
  }) as CraftInstructionProjection;
}
