import type {
  ExtensionMetadata,
  IssueSeverity,
} from '../domain/types.ts';
import type {
  MerchantEffort,
  RecommendationImpact,
  RecommendationPlanPriority,
} from '../recommendation-intelligence/types.ts';

export type CatalogHealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type CatalogHealthStatus =
  | 'EXCELLENT'
  | 'HEALTHY'
  | 'NEEDS_ATTENTION'
  | 'POOR'
  | 'CRITICAL'
  | 'INSUFFICIENT_ANALYSIS';

export type CatalogPublishingReadiness =
  | 'READY'
  | 'READY_WITH_WARNINGS'
  | 'REVIEW_RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED'
  | 'UNKNOWN';

export type HealthDimensionId =
  | 'IDENTITY'
  | 'DATA_COMPLETENESS'
  | 'PRODUCT_TRUTH'
  | 'CONSISTENCY'
  | 'SEO'
  | 'MEDIA'
  | 'VARIANTS'
  | 'PRICING'
  | 'SPECIFICATIONS'
  | 'CATALOG_INTEGRITY'
  | 'PUBLISHING_READINESS';

export type CatalogSegmentType =
  | 'VENDOR'
  | 'PRODUCT_TYPE'
  | 'CATEGORY'
  | 'STATUS'
  | 'SOURCE'
  | 'METADATA';

export type ProblemConcentrationKind =
  | 'CATALOG_WIDE'
  | 'SEGMENT_CONCENTRATED'
  | 'ISOLATED'
  | 'DISTRIBUTED';

export interface PublishingReadinessSummary {
  readonly counts: Readonly<Record<CatalogPublishingReadiness, number>>;
  readonly percentages: Readonly<Record<CatalogPublishingReadiness, number>>;
  readonly publishReadyCount: number;
  readonly publishReadyPercentage: number;
  readonly blockedPercentage: number;
  readonly unknownCount: number;
}

export interface CatalogCoverageSummary {
  readonly totalProductsSupplied: number;
  readonly productsNormalized: number;
  readonly productsAnalyzedByCapability: Readonly<{
    deterministicQuality: number;
    productTruth: number;
    aiDetective: number;
    recommendationIntelligence: number;
  }>;
  readonly productsWithProductTruthFindings: number;
  readonly productsWithSufficientEvidence: number;
  readonly productsWithDetectiveEvaluation: number;
  readonly productsWithRecommendationPlans: number;
  readonly productsExcluded: number;
  readonly exclusionReasons: Readonly<Record<string, number>>;
  readonly completenessPercentage: number;
  readonly evidenceCoveragePercentage: number;
  readonly provenanceCoveragePercentage: number;
  readonly confidenceImpact: number;
  readonly missingCapabilities: readonly string[];
  readonly fingerprint: string;
}

export interface HealthScoreFactor {
  readonly code: string;
  readonly contribution: number;
  readonly explanation: string;
}

export interface CatalogHealthScoreExplanation {
  readonly weightedDimensionScore: number;
  readonly blockerPenalty: number;
  readonly criticalRiskPenalty: number;
  readonly insufficientAnalysisPenalty: number;
  readonly finalScore: number;
  readonly factors: readonly HealthScoreFactor[];
}

export interface ProductHealthSummary {
  readonly productId: string;
  readonly externalId?: string;
  readonly vendor?: string;
  readonly productType?: string;
  readonly category?: string;
  readonly source?: string;
  readonly productStatus?: string;
  readonly healthScore: number;
  readonly healthGrade: CatalogHealthGrade;
  readonly healthStatus: CatalogHealthStatus;
  readonly publishingReadiness: CatalogPublishingReadiness;
  readonly assessmentConfidence: number;
  readonly issueCountsBySeverity: Readonly<Record<IssueSeverity, number>>;
  readonly truthQualityStatus:
    | 'TRUSTED'
    | 'REVIEW_RECOMMENDED'
    | 'REVIEW_REQUIRED'
    | 'BLOCKED'
    | 'NO_EVIDENCE';
  readonly contradictionCounts: Readonly<Record<IssueSeverity, number>>;
  readonly blockerCount: number;
  readonly quickWinCount: number;
  readonly recommendationCount: number;
  readonly affectedDimensions: readonly HealthDimensionId[];
  readonly topProblemIds: readonly string[];
  readonly priorityRecommendationIds: readonly string[];
  readonly fingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface HealthDimension {
  readonly dimensionId: HealthDimensionId;
  readonly score: number;
  readonly grade: CatalogHealthGrade;
  readonly status: CatalogHealthStatus;
  readonly assessmentConfidence: number;
  readonly productsEvaluated: number;
  readonly affectedProducts: number;
  readonly affectedPercentage: number;
  readonly blockerCount: number;
  readonly criticalIssueCount: number;
  readonly highIssueCount: number;
  readonly mediumIssueCount: number;
  readonly lowIssueCount: number;
  readonly recommendationCount: number;
  readonly explanationFactors: readonly HealthScoreFactor[];
  readonly fingerprint: string;
}

export interface CatalogSegmentSummary {
  readonly segmentType: CatalogSegmentType;
  readonly segmentKey: string;
  readonly segmentLabel: string;
  readonly productCount: number;
  readonly healthScore: number;
  readonly healthGrade: CatalogHealthGrade;
  readonly healthStatus: CatalogHealthStatus;
  readonly publishReadyPercentage: number;
  readonly blockedProductCount: number;
  readonly reviewRequiredCount: number;
  readonly topIssueFamilies: readonly string[];
  readonly topRecommendationCategories: readonly string[];
  readonly assessmentConfidence: number;
  readonly fingerprint: string;
}

export interface ProblemConcentration {
  readonly kind: ProblemConcentrationKind;
  readonly segmentType?: CatalogSegmentType;
  readonly segmentKey?: string;
  readonly segmentLabel?: string;
  readonly affectedProductShare?: number;
  readonly explanation: string;
}

export interface CatalogProblem {
  readonly problemId: string;
  readonly canonicalProblemKey: string;
  readonly title: string;
  readonly description: string;
  readonly severity: IssueSeverity;
  readonly impact: RecommendationImpact;
  readonly affectedProducts: number;
  readonly affectedProductPercentage: number;
  readonly blockerCount: number;
  readonly totalOccurrences: number;
  readonly relatedIssueIds: readonly string[];
  readonly relatedContradictionIds: readonly string[];
  readonly relatedRecommendationIds: readonly string[];
  readonly representativeProductIds: readonly string[];
  readonly concentration: ProblemConcentration;
  readonly rankingScore: number;
  readonly fingerprint: string;
}

export interface CatalogFocusArea {
  readonly focusAreaId: string;
  readonly title: string;
  readonly category: string;
  readonly priority: RecommendationPlanPriority;
  readonly affectedProducts: number;
  readonly expectedCatalogHealthDimension: HealthDimensionId;
  readonly relatedCatalogProblemIds: readonly string[];
  readonly relatedRecommendationIds: readonly string[];
  readonly blockerStatus: 'BLOCKER' | 'BLOCKED' | 'NON_BLOCKING';
  readonly estimatedMerchantEffort: MerchantEffort;
  readonly impact: RecommendationImpact;
  readonly explanation: string;
  readonly requiresMerchantApproval: true;
  readonly fingerprint: string;
}

export interface CatalogRecommendationSummary {
  readonly totalRecommendations: number;
  readonly blockerCount: number;
  readonly quickWinCount: number;
  readonly focusAreaCount: number;
  readonly highestPriority: RecommendationPlanPriority | null;
}

export interface CatalogHealthReport {
  readonly reportId: string;
  readonly schemaVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly catalogFingerprint: string;
  readonly productsAnalyzed: number;
  readonly productsWithSufficientAnalysis: number;
  readonly productsWithIncompleteAnalysis: number;
  readonly overallHealthScore: number;
  readonly overallHealthGrade: CatalogHealthGrade;
  readonly overallHealthStatus: CatalogHealthStatus;
  readonly assessmentConfidence: number;
  readonly publishReadyProductCount: number;
  readonly reviewRecommendedProductCount: number;
  readonly reviewRequiredProductCount: number;
  readonly blockedProductCount: number;
  readonly trustedProductCount: number;
  readonly productsWithoutEvidence: number;
  readonly healthDimensions: readonly HealthDimension[];
  readonly productHealthSummaries: readonly ProductHealthSummary[];
  readonly segmentSummaries: readonly CatalogSegmentSummary[];
  readonly topProblems: readonly CatalogProblem[];
  readonly priorityFocusAreas: readonly CatalogFocusArea[];
  readonly recommendationSummary: CatalogRecommendationSummary;
  readonly readinessSummary: PublishingReadinessSummary;
  readonly coverageSummary: CatalogCoverageSummary;
  readonly scoreExplanation: CatalogHealthScoreExplanation;
  readonly fingerprint: string;
  readonly generatedAt: string;
  readonly metadata: ExtensionMetadata;
}
