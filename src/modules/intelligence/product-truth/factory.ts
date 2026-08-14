import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { CapabilityPack } from '../packs/capability.ts';
import { ProductTruthAnalyzer } from './analyzer.ts';
import { createProductTruthCapabilityPack } from './capability.ts';
import { ProductTruthConfidenceStrategy } from './confidence.ts';
import {
  createProductTruthConfiguration,
  type ProductTruthConfiguration,
  type ProductTruthConfigurationInput,
} from './configuration.ts';
import {
  createProductTruthDetectors,
  type ProductTruthDetector,
} from './detectors.ts';
import {
  createDefaultProductTruthClaimExtractorRegistry,
  type ProductTruthClaimExtractorRegistry,
} from './extractors.ts';
import { ProductTruthRecommendationStrategy } from './recommendations.ts';
import {
  GenericTruthValueComparisonStrategy,
  type TruthValueComparisonStrategy,
} from './normalization.ts';
import {
  createDefaultProductTruthResolutionStrategyRegistry,
  type ProductTruthResolutionStrategyRegistry,
} from './resolution.ts';
import { defaultProductIntelligenceRegistry } from '../../product-intelligence/registry/default-registry.ts';
import type { ProductIntelligenceRegistry } from '../../product-intelligence/registry/product-intelligence-registry.ts';

export interface ProductTruthBundle {
  readonly configuration: ProductTruthConfiguration;
  readonly capabilityPack: CapabilityPack;
  readonly extractorRegistry: ProductTruthClaimExtractorRegistry;
  readonly resolutionStrategyRegistry: ProductTruthResolutionStrategyRegistry;
  readonly confidenceStrategy: ProductTruthConfidenceStrategy;
  readonly comparisonStrategy: TruthValueComparisonStrategy;
  readonly analyzer: ProductTruthAnalyzer;
  readonly detectors: readonly ProductTruthDetector[];
  readonly recommendationStrategy: ProductTruthRecommendationStrategy;
}

export function createProductTruthBundle(input: {
  readonly hasher: IntelligenceHasher;
  readonly configuration?: ProductTruthConfigurationInput;
  readonly extractorRegistry?: ProductTruthClaimExtractorRegistry;
  readonly resolutionStrategyRegistry?: ProductTruthResolutionStrategyRegistry;
  readonly comparisonStrategy?: TruthValueComparisonStrategy;
  readonly productIntelligenceRegistry?: ProductIntelligenceRegistry;
}): ProductTruthBundle {
  const configuration = createProductTruthConfiguration(input.configuration);
  const extractorRegistry = input.extractorRegistry
    ?? createDefaultProductTruthClaimExtractorRegistry({
      configuration,
      hasher: input.hasher,
    });
  const resolutionStrategyRegistry = input.resolutionStrategyRegistry
    ?? createDefaultProductTruthResolutionStrategyRegistry();
  const confidenceStrategy = new ProductTruthConfidenceStrategy();
  const comparisonStrategy = input.comparisonStrategy ?? new GenericTruthValueComparisonStrategy();
  const analyzer = new ProductTruthAnalyzer({
    configuration,
    extractorRegistry,
    resolutionStrategyRegistry,
    confidenceStrategy,
    comparisonStrategy,
    hasher: input.hasher,
    productIntelligenceRegistry: input.productIntelligenceRegistry
      ?? defaultProductIntelligenceRegistry,
  });
  return Object.freeze({
    configuration,
    capabilityPack: createProductTruthCapabilityPack(),
    extractorRegistry,
    resolutionStrategyRegistry,
    confidenceStrategy,
    comparisonStrategy,
    analyzer,
    detectors: createProductTruthDetectors(analyzer),
    recommendationStrategy: new ProductTruthRecommendationStrategy(input.hasher),
  });
}
