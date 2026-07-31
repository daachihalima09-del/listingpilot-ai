import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { IntelligenceContext } from '../domain/types.ts';
import type {
  DetectorMetadata,
  DetectorResult,
  IntelligenceDetector,
} from '../detectors/contract.ts';
import {
  PRODUCT_TRUTH_CAPABILITY_ID,
} from '../product-truth/configuration.ts';
import { getProductTruthReportFromContext } from '../product-truth/report.ts';
import {
  AI_DETECTIVE_CAPABILITY_ID,
  AI_DETECTIVE_VERSION,
  type AIDetectiveConfiguration,
} from './configuration.ts';
import { AIDetectiveConfidenceStrategy } from './confidence.ts';
import {
  DETECTIVE_EVALUATORS,
  type DetectiveEvaluator,
} from './evaluation.ts';
import { createAIDetectiveIssues } from './issues.ts';
import {
  collectPriorContradictions,
  createDetectiveReport,
} from './report.ts';
import type { ContradictionRuleRegistry } from './rules.ts';

export const AI_DETECTIVE_CONTRADICTIONS_METADATA_KEY = 'aiDetectiveContradictions';
export const AI_DETECTIVE_REPORT_METADATA_KEY = 'detectiveReport';

interface DetectorDependencies {
  readonly configuration: AIDetectiveConfiguration;
  readonly rules: ContradictionRuleRegistry;
  readonly confidenceStrategy: AIDetectiveConfidenceStrategy;
  readonly hasher: IntelligenceHasher;
}

interface EvaluationDetectorDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly family: keyof typeof DETECTIVE_EVALUATORS;
  readonly priority: number;
}

class AIDetectiveEvaluationDetector implements IntelligenceDetector {
  readonly metadata: DetectorMetadata;
  private readonly evaluator: DetectiveEvaluator;
  private readonly dependencies: DetectorDependencies;

  constructor(
    definition: EvaluationDetectorDefinition,
    dependencies: DetectorDependencies,
  ) {
    this.metadata = Object.freeze({
      id: definition.id,
      displayName: definition.displayName,
      version: AI_DETECTIVE_VERSION,
      description: definition.description,
      issueCategories: ['PRODUCT_TRUTH'],
      supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
      requiredCapabilities: [
        PRODUCT_TRUTH_CAPABILITY_ID,
        AI_DETECTIVE_CAPABILITY_ID,
      ],
      priority: definition.priority,
      timeoutMs: 10_000,
      parallelSafe: false,
      enabled: true,
      deterministic: true,
    } satisfies DetectorMetadata);
    this.evaluator = DETECTIVE_EVALUATORS[definition.family];
    this.dependencies = dependencies;
  }

  execute(context: IntelligenceContext): DetectorResult {
    const truthReport = getProductTruthReportFromContext(context);
    if (!truthReport) {
      return {
        issues: [],
        warnings: [`${this.metadata.displayName} could not run because the Product Truth report is unavailable.`],
        metrics: {
          inspectedProducts: context.products.length,
          contradictionCount: 0,
        },
        metadata: {
          [AI_DETECTIVE_CONTRADICTIONS_METADATA_KEY]: [],
          capabilityId: AI_DETECTIVE_CAPABILITY_ID,
          capabilityVersion: AI_DETECTIVE_VERSION,
          productTruthRequired: true,
        },
      };
    }
    const contradictions = this.evaluator({
      context,
      truthReport,
      ...this.dependencies,
    });
    const issues = createAIDetectiveIssues({
      contradictions,
      context,
      detectorId: this.metadata.id,
      hasher: this.dependencies.hasher,
    });
    return {
      issues,
      warnings: [],
      metrics: {
        inspectedProducts: context.products.length,
        inspectedTruthFindings: truthReport.findings.length,
        contradictionCount: contradictions.length,
        issueCount: issues.length,
      },
      metadata: {
        [AI_DETECTIVE_CONTRADICTIONS_METADATA_KEY]: contradictions,
        capabilityId: AI_DETECTIVE_CAPABILITY_ID,
        capabilityVersion: AI_DETECTIVE_VERSION,
        productTruthFingerprint: truthReport.deterministicFingerprint,
      },
    };
  }
}

export class TruthConflictDetector extends AIDetectiveEvaluationDetector {
  constructor(dependencies: DetectorDependencies) {
    super({
      id: 'ai-detective.truth-conflict',
      displayName: 'Truth conflict detector',
      description: 'Detects materially supported conflicting Product Truth values.',
      family: 'truth-conflict',
      priority: 1_100,
    }, dependencies);
  }
}

export class IdentityConflictDetector extends AIDetectiveEvaluationDetector {
  constructor(dependencies: DetectorDependencies) {
    super({
      id: 'ai-detective.identity-conflict',
      displayName: 'Identity conflict detector',
      description: 'Detects normalized SKU and barcode identities shared by multiple records.',
      family: 'identity-conflict',
      priority: 1_200,
    }, dependencies);
  }
}

export class ImpossibleCombinationDetector extends AIDetectiveEvaluationDetector {
  constructor(dependencies: DetectorDependencies) {
    super({
      id: 'ai-detective.combination-conflict',
      displayName: 'Combination contradiction detector',
      description: 'Evaluates data-driven impossible and suspicious fact-combination rules.',
      family: 'combination',
      priority: 1_300,
    }, dependencies);
  }
}

export class WeakEvidenceDetector extends AIDetectiveEvaluationDetector {
  constructor(dependencies: DetectorDependencies) {
    super({
      id: 'ai-detective.weak-evidence',
      displayName: 'Weak evidence detector',
      description: 'Detects merchant overrides that conflict with stronger supplied evidence.',
      family: 'weak-evidence',
      priority: 1_400,
    }, dependencies);
  }
}

export class ListingConflictDetector extends AIDetectiveEvaluationDetector {
  constructor(dependencies: DetectorDependencies) {
    super({
      id: 'ai-detective.listing-conflict',
      displayName: 'Listing conflict detector',
      description: 'Detects normalized listing values that differ from verified Product Truth.',
      family: 'listing-conflict',
      priority: 1_500,
    }, dependencies);
  }
}

export class AIDetectiveReportDetector implements IntelligenceDetector {
  readonly metadata: DetectorMetadata = Object.freeze({
    id: 'ai-detective.report',
    displayName: 'AI Detective report',
    version: AI_DETECTIVE_VERSION,
    description: 'Aggregates deterministic and future compatible contradiction fragments.',
    issueCategories: ['PRODUCT_TRUTH'],
    supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
    requiredCapabilities: [
      PRODUCT_TRUTH_CAPABILITY_ID,
      AI_DETECTIVE_CAPABILITY_ID,
    ],
    priority: 1_900,
    timeoutMs: 10_000,
    parallelSafe: false,
    enabled: true,
    deterministic: true,
  } satisfies DetectorMetadata);
  private readonly configuration: AIDetectiveConfiguration;
  private readonly hasher: IntelligenceHasher;

  constructor(input: {
    readonly configuration: AIDetectiveConfiguration;
    readonly hasher: IntelligenceHasher;
  }) {
    this.configuration = input.configuration;
    this.hasher = input.hasher;
  }

  execute(context: IntelligenceContext): DetectorResult {
    const truthReport = getProductTruthReportFromContext(context);
    const contradictions = collectPriorContradictions(context);
    const warnings = truthReport
      ? []
      : ['AI Detective report is incomplete because the Product Truth report is unavailable.'];
    const report = createDetectiveReport({
      context,
      contradictions,
      configuration: this.configuration,
      hasher: this.hasher,
      warnings,
    });
    return {
      issues: [],
      warnings,
      metrics: {
        productCount: report.productsAnalyzed,
        contradictionCount: report.contradictionsFound,
        blockedProductCount: report.blockedProducts.length,
        reviewRequiredCount: report.reviewRequired,
      },
      metadata: {
        [AI_DETECTIVE_REPORT_METADATA_KEY]: report,
        capabilityId: AI_DETECTIVE_CAPABILITY_ID,
        capabilityVersion: AI_DETECTIVE_VERSION,
      },
    };
  }
}

export type AIDetectiveDetector =
  | TruthConflictDetector
  | IdentityConflictDetector
  | ImpossibleCombinationDetector
  | WeakEvidenceDetector
  | ListingConflictDetector
  | AIDetectiveReportDetector;

export function createAIDetectiveDetectors(
  dependencies: DetectorDependencies,
): readonly AIDetectiveDetector[] {
  return Object.freeze([
    new TruthConflictDetector(dependencies),
    new IdentityConflictDetector(dependencies),
    new ImpossibleCombinationDetector(dependencies),
    new WeakEvidenceDetector(dependencies),
    new ListingConflictDetector(dependencies),
    new AIDetectiveReportDetector(dependencies),
  ]);
}
