import type { CoordinatorStep } from './coordinator-types.ts';

export interface CoordinatorApplicabilityInput {
  productReady: boolean;
  hasVariantConfiguration: boolean;
  hasEnabledMappedMetafields: boolean;
  hasActiveImages: boolean;
  freshness: Record<CoordinatorStep, string>;
}

export interface StepApplicability {
  step: CoordinatorStep;
  applicable: boolean;
  safeMessage: string;
  freshnessKey: string;
}

export function resolveCoordinatorApplicability(
  input: CoordinatorApplicabilityInput,
): StepApplicability[] {
  return [
    {
      step: 'PRODUCT',
      applicable: true,
      safeMessage: input.productReady
        ? 'Product listing is ready for Shopify.'
        : 'Complete the saved product listing before publishing.',
      freshnessKey: input.freshness.PRODUCT,
    },
    {
      step: 'VARIANTS',
      applicable: input.hasVariantConfiguration,
      safeMessage: input.hasVariantConfiguration
        ? 'Variant configuration is ready.'
        : 'No variant configuration is saved.',
      freshnessKey: input.freshness.VARIANTS,
    },
    {
      step: 'METAFIELDS',
      applicable: input.hasEnabledMappedMetafields,
      safeMessage: input.hasEnabledMappedMetafields
        ? 'Mapped metafields are ready.'
        : 'No enabled mapped metafields have values.',
      freshnessKey: input.freshness.METAFIELDS,
    },
    {
      step: 'IMAGES',
      applicable: input.hasActiveImages,
      safeMessage: input.hasActiveImages
        ? 'Configured images are ready.'
        : 'No active images are configured.',
      freshnessKey: input.freshness.IMAGES,
    },
  ];
}
