import type { IntelligenceContext } from '../domain/types.ts';
import type {
  DetectorMetadata,
  DetectorResult,
  IntelligenceDetector,
} from '../detectors/contract.ts';
import { ProductTruthAnalyzer } from './analyzer.ts';
import {
  PRODUCT_TRUTH_CAPABILITY_ID,
  PRODUCT_TRUTH_VERSION,
} from './configuration.ts';

export class ProductTruthDetector implements IntelligenceDetector {
  readonly metadata: DetectorMetadata = Object.freeze({
    id: 'product-truth.analysis',
    displayName: 'Product Truth analysis',
    version: PRODUCT_TRUTH_VERSION,
    description: 'Extracts, groups, evaluates, and resolves structured product claims.',
    issueCategories: ['PRODUCT_TRUTH'],
    supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
    requiredCapabilities: [PRODUCT_TRUTH_CAPABILITY_ID],
    priority: 900,
    timeoutMs: 10_000,
    parallelSafe: true,
    enabled: true,
    deterministic: true,
  } satisfies DetectorMetadata);
  private readonly analyzer: ProductTruthAnalyzer;

  constructor(analyzer: ProductTruthAnalyzer) {
    this.analyzer = analyzer;
  }

  execute(context: IntelligenceContext): DetectorResult {
    const analysis = this.analyzer.analyze(context, this.metadata.id);
    return {
      issues: analysis.issues,
      warnings: analysis.warnings,
      metrics: {
        productCount: analysis.report.productCount,
        claimCount: analysis.report.claimCount,
        claimGroupCount: analysis.report.claimGroupCount,
        findingCount: analysis.report.findings.length,
        issueCount: analysis.issues.length,
      },
      metadata: {
        productTruthReport: analysis.report,
        capabilityId: PRODUCT_TRUTH_CAPABILITY_ID,
        capabilityVersion: PRODUCT_TRUTH_VERSION,
      },
    };
  }
}

export function createProductTruthDetectors(analyzer: ProductTruthAnalyzer): readonly ProductTruthDetector[] {
  return Object.freeze([new ProductTruthDetector(analyzer)]);
}
