import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import { createAIDetectiveCapabilityPack } from './capability.ts';
import { AIDetectiveConfidenceStrategy } from './confidence.ts';
import {
  createAIDetectiveConfiguration,
  type AIDetectiveConfiguration,
  type AIDetectiveConfigurationInput,
} from './configuration.ts';
import {
  createAIDetectiveDetectors,
  type AIDetectiveDetector,
} from './detectors.ts';
import { AIDetectiveRecommendationStrategy } from './recommendations.ts';
import {
  ContradictionRuleRegistry,
  createDefaultContradictionRuleRegistry,
} from './rules.ts';

export interface AIDetectiveBundle {
  readonly configuration: AIDetectiveConfiguration;
  readonly capabilityPack: CapabilityPack;
  readonly ruleRegistry: ContradictionRuleRegistry;
  readonly confidenceStrategy: AIDetectiveConfidenceStrategy;
  readonly detectors: readonly AIDetectiveDetector[];
  readonly recommendationStrategy: AIDetectiveRecommendationStrategy;
}

export function createAIDetectiveBundle(input: {
  readonly hasher: IntelligenceHasher;
  readonly configuration?: AIDetectiveConfigurationInput;
  readonly ruleRegistry?: ContradictionRuleRegistry;
}): AIDetectiveBundle {
  const configuration = createAIDetectiveConfiguration(input.configuration);
  const ruleRegistry = input.ruleRegistry ?? createDefaultContradictionRuleRegistry();
  const confidenceStrategy = new AIDetectiveConfidenceStrategy();
  return Object.freeze({
    configuration,
    capabilityPack: createAIDetectiveCapabilityPack(),
    ruleRegistry,
    confidenceStrategy,
    detectors: createAIDetectiveDetectors({
      configuration,
      rules: ruleRegistry,
      confidenceStrategy,
      hasher: input.hasher,
    }),
    recommendationStrategy: new AIDetectiveRecommendationStrategy(input.hasher),
  });
}
