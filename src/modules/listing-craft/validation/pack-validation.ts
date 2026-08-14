import { z } from 'zod';
import type { ListingCraftRulePack } from '../domain/contracts.ts';
import { ListingCraftError } from '../domain/errors.ts';

const id = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u);
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
const nonEmptyStrings = z.array(z.string().trim().min(1)).min(1).max(100);

export function validateCraftPack(value: ListingCraftRulePack): ListingCraftRulePack {
  const base = z.object({
    id,
    version: semver,
    displayName: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    supportedListingStandardIds: nonEmptyStrings,
    principles: nonEmptyStrings,
  }).safeParse(value);
  const rules = value.validationRules ?? [];
  const ruleIds = rules.map(({ id: ruleId }) => ruleId);
  const invalid = !base.success
    || new Set(value.supportedListingStandardIds).size !== value.supportedListingStandardIds.length
    || new Set(ruleIds).size !== ruleIds.length
    || value.titleRules.preferredCharacterRange.minimum < 1
    || value.titleRules.preferredCharacterRange.maximum < value.titleRules.preferredCharacterRange.minimum
    || value.titleRules.maximumDifferentiators < 0
    || value.titleRules.maximumDifferentiators > 10
    || value.featureRules.minimumCount < 0
    || value.featureRules.maximumCount < value.featureRules.minimumCount
    || value.featureRules.maximumCount > 30
    || value.specificationRules.maximumValueLength < 10
    || value.specificationRules.fieldGroups.length === 0
    || new Set(value.specificationRules.fieldGroups.map(({ label }) => label.toLocaleLowerCase('en-US'))).size !== value.specificationRules.fieldGroups.length
    || value.overviewRules.preferredParagraphCount < 1
    || value.overviewRules.maximumParagraphCount < value.overviewRules.preferredParagraphCount
    || value.overviewRules.maximumCharacters < 100
    || value.identityRules.vendorMayImplyBrand !== false
    || value.identityRules.inferCondition !== false;
  if (invalid) {
    throw new ListingCraftError('INVALID_CRAFT_PACK', 'The Listing Craft Rule Pack is invalid or unsafe.');
  }
  return value;
}
