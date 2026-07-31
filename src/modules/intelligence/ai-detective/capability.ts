import type { CapabilityPack } from '../packs/capability.ts';
import {
  PRODUCT_TRUTH_CAPABILITY_ID,
} from '../product-truth/configuration.ts';
import {
  AI_DETECTIVE_CAPABILITY_ID,
  AI_DETECTIVE_VERSION,
} from './configuration.ts';

export function createAIDetectiveCapabilityPack(): CapabilityPack {
  return Object.freeze({
    id: AI_DETECTIVE_CAPABILITY_ID,
    name: 'AI Detective',
    version: AI_DETECTIVE_VERSION,
    description: 'Detects deterministic contradictions between Product Truth findings and normalized product facts.',
    supportedIssueCategories: ['PRODUCT_TRUTH'],
    requiredContextFeatures: ['normalized-products', 'product-truth-findings'],
    compatibilityMetadata: {
      sourceIndependent: true,
      deterministic: true,
      productTruthRequired: true,
    },
    dependencies: [PRODUCT_TRUTH_CAPABILITY_ID],
    extensionMetadata: {
      contradictionProducerContract: 'ai-detective-contradictions-v1',
      futureLLMDetectorsSupported: true,
      generatesFacts: false,
    },
    enabled: true,
  } satisfies CapabilityPack);
}
