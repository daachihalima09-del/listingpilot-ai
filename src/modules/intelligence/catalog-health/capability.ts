import { AI_DETECTIVE_CAPABILITY_ID } from '../ai-detective/configuration.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import { PRODUCT_TRUTH_CAPABILITY_ID } from '../product-truth/configuration.ts';
import { RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID } from '../recommendation-intelligence/configuration.ts';
import { DETERMINISTIC_QUALITY_CAPABILITY_ID } from '../rules/definitions.ts';
import {
  CATALOG_HEALTH_CAPABILITY_ID,
  CATALOG_HEALTH_VERSION,
} from './configuration.ts';

export function createCatalogHealthCapabilityPack(): CapabilityPack {
  return Object.freeze({
    id: CATALOG_HEALTH_CAPABILITY_ID,
    name: 'Catalog Health',
    version: CATALOG_HEALTH_VERSION,
    description: 'Aggregates product intelligence into a deterministic catalog-level health assessment.',
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
      'product-truth-report',
      'ai-detective-report',
      'recommendation-plan',
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
      RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
    ],
    extensionMetadata: {
      reportMetadataKey: 'catalogHealth',
      persistence: false,
      historicalTrends: false,
    },
    enabled: true,
  } satisfies CapabilityPack);
}
