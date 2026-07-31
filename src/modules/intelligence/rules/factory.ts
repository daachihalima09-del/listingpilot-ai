import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import {
  createDeterministicRuleConfiguration,
  type DeterministicRuleConfiguration,
  type DeterministicRuleConfigurationInput,
} from './configuration.ts';
import { createDeterministicQualityCapabilityPack } from './capability.ts';
import { DEFAULT_DETERMINISTIC_RULE_DEFINITIONS } from './definitions.ts';
import {
  createDeterministicRuleDetectors,
  type SynchronousRuleDetector,
} from './detectors.ts';
import { DeterministicRuleRecommendationStrategy } from './recommendations.ts';
import { RuleRegistry } from './registry.ts';

export function createDefaultDeterministicRuleRegistry(): RuleRegistry {
  const registry = new RuleRegistry();
  for (const rule of DEFAULT_DETERMINISTIC_RULE_DEFINITIONS) registry.register(rule);
  return registry;
}

export interface DeterministicRuleBundle {
  readonly configuration: DeterministicRuleConfiguration;
  readonly ruleRegistry: RuleRegistry;
  readonly capabilityPack: CapabilityPack;
  readonly detectors: readonly SynchronousRuleDetector[];
  readonly recommendationStrategy: DeterministicRuleRecommendationStrategy;
}

export function createDeterministicRuleBundle(input: {
  readonly hasher: IntelligenceHasher;
  readonly configuration?: DeterministicRuleConfigurationInput;
  readonly registry?: RuleRegistry;
}): DeterministicRuleBundle {
  const configuration = createDeterministicRuleConfiguration(input.configuration);
  const ruleRegistry = input.registry ?? createDefaultDeterministicRuleRegistry();
  return Object.freeze({
    configuration,
    ruleRegistry,
    capabilityPack: createDeterministicQualityCapabilityPack(),
    detectors: createDeterministicRuleDetectors({
      registry: ruleRegistry,
      configuration,
      hasher: input.hasher,
    }),
    recommendationStrategy: new DeterministicRuleRecommendationStrategy(ruleRegistry, input.hasher),
  });
}
