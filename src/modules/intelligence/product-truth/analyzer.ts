import { immutableCopy } from '../domain/immutability.ts';
import type { IntelligenceContext } from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import { PRODUCT_TRUTH_VERSION } from './configuration.ts';
import { ProductTruthConfidenceStrategy } from './confidence.ts';
import { evaluateProductTruthEvidence } from './evidence-evaluation.ts';
import {
  extractProductTruthClaims,
  type ProductTruthClaimExtractorRegistry,
} from './extractors.ts';
import { groupProductTruthClaims } from './grouping.ts';
import { createProductTruthIssues } from './issues.ts';
import type { TruthValueComparisonStrategy } from './normalization.ts';
import { createProductTruthReport } from './report.ts';
import {
  resolveProductTruthGroups,
  type ProductTruthResolutionStrategyRegistry,
} from './resolution.ts';
import type { ProductTruthAnalysis } from './types.ts';
import { PRODUCT_INTELLIGENCE_DETECTOR_VERSION } from '../../product-intelligence/domain/contracts.ts';
import {
  analyzeProductIntelligenceContext,
  createProductIntelligenceIssues,
} from '../../product-intelligence/integration/product-truth-intelligence.ts';
import type { ProductIntelligenceRegistry } from '../../product-intelligence/registry/product-intelligence-registry.ts';

export interface ProductTruthAnalyzerDependencies {
  readonly configuration: ProductTruthConfiguration;
  readonly extractorRegistry: ProductTruthClaimExtractorRegistry;
  readonly resolutionStrategyRegistry: ProductTruthResolutionStrategyRegistry;
  readonly confidenceStrategy: ProductTruthConfidenceStrategy;
  readonly comparisonStrategy: TruthValueComparisonStrategy;
  readonly hasher: IntelligenceHasher;
  readonly productIntelligenceRegistry: ProductIntelligenceRegistry;
}

export class ProductTruthAnalyzer {
  private readonly dependencies: ProductTruthAnalyzerDependencies;

  constructor(dependencies: ProductTruthAnalyzerDependencies) {
    this.dependencies = dependencies;
  }

  analyze(context: IntelligenceContext, detectorId = 'product-truth.analysis'): ProductTruthAnalysis {
    const extraction = extractProductTruthClaims({
      context,
      registry: this.dependencies.extractorRegistry,
    });
    const grouping = groupProductTruthClaims({
      claims: extraction.claims,
      configuration: this.dependencies.configuration,
      hasher: this.dependencies.hasher,
    });
    const evaluation = evaluateProductTruthEvidence({
      groups: grouping.groups,
      claims: extraction.claims,
      evidence: context.evidence,
      configuration: this.dependencies.configuration,
    });
    const resolutions = resolveProductTruthGroups({
      groups: evaluation.groups,
      claims: extraction.claims,
      configuration: this.dependencies.configuration,
      strategies: this.dependencies.resolutionStrategyRegistry,
      confidenceStrategy: this.dependencies.confidenceStrategy,
      comparisonStrategy: this.dependencies.comparisonStrategy,
      context,
      hasher: this.dependencies.hasher,
    });
    const truthIssues = createProductTruthIssues({
      groups: evaluation.groups,
      resolutions,
      context,
      configuration: this.dependencies.configuration,
      hasher: this.dependencies.hasher,
      detectorId,
      detectorVersion: PRODUCT_TRUTH_VERSION,
    });
    const productIntelligence = analyzeProductIntelligenceContext(
      context,
      this.dependencies.productIntelligenceRegistry,
    );
    const categoryIssues = createProductIntelligenceIssues({
      context,
      analyses: productIntelligence,
      hasher: this.dependencies.hasher,
      detectorId,
      detectorVersion: PRODUCT_INTELLIGENCE_DETECTOR_VERSION,
    });
    const issues = [...truthIssues, ...categoryIssues]
      .sort((left, right) => left.id.localeCompare(right.id));
    const warnings = [...new Set([
      ...extraction.warnings,
      ...grouping.warnings,
      ...evaluation.warnings,
    ])].sort();
    const report = createProductTruthReport({
      context,
      claimCount: extraction.claims.length,
      groups: evaluation.groups,
      resolutions,
      issues,
      evidenceSourceDistribution: evaluation.evidenceSourceDistribution,
      warnings,
      productIntelligence,
      hasher: this.dependencies.hasher,
    });
    return immutableCopy({
      claims: extraction.claims,
      groups: evaluation.groups,
      resolutions,
      report,
      issues,
      warnings,
    }) as ProductTruthAnalysis;
  }
}
