import type {
  GenerationFact,
  ListingGenerationPlan,
} from '../../listing-generation/domain/contracts.ts';

export type FactVisibilityRole = 'REQUIRED_VISIBLE' | 'AVAILABLE_VERIFIED';
export type RequiredFactPlacement = 'TITLE' | 'STRUCTURED_DETAILS';

const titleComponentFields: Readonly<Record<string, readonly string[]>> = {
  BRAND: ['brand'],
  PRODUCT_TYPE: ['product_type', 'type'],
  MODEL: ['model', 'model_number'],
  MODEL_NUMBER: ['model', 'model_number'],
  SIZE_OR_CAPACITY: ['size', 'screen_size', 'capacity', 'size_or_capacity'],
  TECHNOLOGY: ['technology', 'display_technology', 'resolution'],
};

function normalized(value: string): string {
  return value.toLocaleUpperCase('en-US').replace(/[^A-Z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
}

export function requiredFactPlacements(
  fact: Pick<GenerationFact, 'fieldId' | 'allowedUses'>,
  plan: Pick<ListingGenerationPlan, 'titlePlan' | 'descriptionPlan' | 'craftPlan'>,
): readonly RequiredFactPlacement[] {
  const placements: RequiredFactPlacement[] = [];
  const titleRequired = new Set(plan.titlePlan.requiredComponents.map(normalized));
  const titleRequiredFields = [...titleRequired].flatMap((component) => titleComponentFields[component] ?? []);
  if (fact.allowedUses.includes('TITLE') && titleRequiredFields.includes(fact.fieldId)) {
    placements.push('TITLE');
  }

  const requiredLabels = new Set(plan.descriptionPlan.requiredLabels.map(normalized));
  const requiredStructuredField = plan.craftPlan?.specificationCraftRules.fieldGroups.some((group) => (
    group.fieldIds.includes(fact.fieldId)
    && (group.requiredByDefault || requiredLabels.has(normalized(group.label)))
  )) ?? false;
  if (fact.allowedUses.includes('DESCRIPTION') && requiredStructuredField) {
    placements.push('STRUCTURED_DETAILS');
  }
  return placements;
}

export function factVisibilityRole(
  fact: Pick<GenerationFact, 'fieldId' | 'allowedUses'>,
  plan: Pick<ListingGenerationPlan, 'titlePlan' | 'descriptionPlan' | 'craftPlan'>,
): FactVisibilityRole {
  return requiredFactPlacements(fact, plan).length > 0 ? 'REQUIRED_VISIBLE' : 'AVAILABLE_VERIFIED';
}
