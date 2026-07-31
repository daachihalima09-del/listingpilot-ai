import type { CapabilityPack } from '../packs/capability.ts';
import { AI_DETECTIVE_CAPABILITY_ID } from '../ai-detective/configuration.ts';
import { PRODUCT_TRUTH_CAPABILITY_ID } from '../product-truth/configuration.ts';
import { DETERMINISTIC_QUALITY_CAPABILITY_ID } from '../rules/definitions.ts';
import {
  RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
  RECOMMENDATION_INTELLIGENCE_VERSION,
} from './configuration.ts';

export function createRecommendationIntelligenceCapabilityPack(): CapabilityPack {
  return Object.freeze({
    id: RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
    name: 'Recommendation Intelligence',
    version: RECOMMENDATION_INTELLIGENCE_VERSION,
    description: 'Transforms deterministic issues and recommendations into an explainable execution plan.',
    supportedIssueCategories: [
      'PRODUCT_TRUTH',
      'DATA_QUALITY',
      'CATALOG_HEALTH',
      'SEO',
      'SPECIFICATION',
      'MEDIA',
      'VARIANT',
      'PRICING',
      'OTHER',
    ],
    requiredContextFeatures: [
      'normalized-products',
      'intelligence-issues',
      'intelligence-recommendations',
    ],
    compatibilityMetadata: {
      sourceIndependent: true,
      deterministic: true,
      generatesFacts: false,
    },
    dependencies: [
      DETERMINISTIC_QUALITY_CAPABILITY_ID,
      PRODUCT_TRUTH_CAPABILITY_ID,
      AI_DETECTIVE_CAPABILITY_ID,
    ],
    extensionMetadata: {
      reportMetadataKey: 'recommendationPlan',
      executionPlanning: true,
      persistence: false,
    },
    enabled: true,
  } satisfies CapabilityPack);
}
