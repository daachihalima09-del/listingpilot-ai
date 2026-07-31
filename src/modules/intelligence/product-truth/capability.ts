import type { CapabilityPack } from '../packs/capability.ts';
import {
  PRODUCT_TRUTH_CAPABILITY_ID,
  PRODUCT_TRUTH_VERSION,
} from './configuration.ts';

export function createProductTruthCapabilityPack(): CapabilityPack {
  return Object.freeze({
    id: PRODUCT_TRUTH_CAPABILITY_ID,
    name: 'Product Truth',
    version: PRODUCT_TRUTH_VERSION,
    description: 'Evaluates structured product claims using supplied, traceable evidence.',
    supportedIssueCategories: ['PRODUCT_TRUTH'],
    requiredContextFeatures: ['normalized-products', 'supplied-evidence'],
    compatibilityMetadata: {
      sourceIndependent: true,
      deterministic: true,
      knowledgePackOptional: true,
    },
    dependencies: [],
    extensionMetadata: {
      evidenceRequirement: 'SUPPLIED_ONLY',
      resolutionPolicy: 'EXPLAINABLE_DETERMINISTIC',
      categorySpecificKnowledgeRequired: false,
    },
    enabled: true,
  } satisfies CapabilityPack);
}
