import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { IntelligenceReportContributor } from '../engine/report-contributor.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import { createRecommendationIntelligenceCapabilityPack } from './capability.ts';
import { RecommendationAppropriatenessConfidenceStrategy } from './confidence.ts';
import {
  createRecommendationIntelligenceConfiguration,
  type RecommendationIntelligenceConfiguration,
  type RecommendationIntelligenceConfigurationInput,
} from './configuration.ts';
import { RecommendationIntelligenceReportContributor } from './integration.ts';
import { RecommendationPlanner } from './plan.ts';
import {
  createDefaultRecommendationRuleRegistry,
  RecommendationRuleRegistry,
} from './rules.ts';

export interface RecommendationIntelligenceBundle {
  readonly configuration: RecommendationIntelligenceConfiguration;
  readonly capabilityPack: CapabilityPack;
  readonly ruleRegistry: RecommendationRuleRegistry;
  readonly confidenceStrategy: RecommendationAppropriatenessConfidenceStrategy;
  readonly planner: RecommendationPlanner;
  readonly reportContributor: IntelligenceReportContributor;
}

export function createRecommendationIntelligenceBundle(input: {
  readonly hasher: IntelligenceHasher;
  readonly configuration?: RecommendationIntelligenceConfigurationInput;
  readonly ruleRegistry?: RecommendationRuleRegistry;
}): RecommendationIntelligenceBundle {
  const configuration = createRecommendationIntelligenceConfiguration(input.configuration);
  const ruleRegistry = input.ruleRegistry ?? createDefaultRecommendationRuleRegistry();
  const confidenceStrategy = new RecommendationAppropriatenessConfidenceStrategy();
  const planner = new RecommendationPlanner({
    configuration,
    rules: ruleRegistry,
    confidence: confidenceStrategy,
    hasher: input.hasher,
  });
  return Object.freeze({
    configuration,
    capabilityPack: createRecommendationIntelligenceCapabilityPack(),
    ruleRegistry,
    confidenceStrategy,
    planner,
    reportContributor: new RecommendationIntelligenceReportContributor(planner),
  });
}
