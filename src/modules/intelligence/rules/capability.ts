import type { CapabilityPack } from '../packs/capability.ts';
import {
  DETERMINISTIC_QUALITY_CAPABILITY_ID,
  DETERMINISTIC_RULE_VERSION,
} from './definitions.ts';

export function createDeterministicQualityCapabilityPack(): CapabilityPack {
  const pack: CapabilityPack = {
    id: DETERMINISTIC_QUALITY_CAPABILITY_ID,
    name: 'Deterministic catalog quality',
    version: DETERMINISTIC_RULE_VERSION,
    description: 'Executes source-independent deterministic catalog validation rules.',
    supportedIssueCategories: [
      'DATA_QUALITY',
      'CATALOG_HEALTH',
      'SEO',
      'SPECIFICATION',
      'MEDIA',
      'VARIANT',
      'PRICING',
    ],
    requiredContextFeatures: ['normalized-products'],
    compatibilityMetadata: {
      sourceIndependent: true,
      deterministic: true,
    },
    dependencies: [],
    extensionMetadata: {
      ruleEngineVersion: DETERMINISTIC_RULE_VERSION,
    },
    enabled: true,
  };
  return Object.freeze(pack);
}
