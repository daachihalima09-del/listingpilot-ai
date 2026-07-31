import type {
  ConfidenceResult,
  ExtensionMetadata,
  IssueSeverity,
} from '../domain/types.ts';

export type RecommendationCategory =
  | 'DATA_COMPLETENESS'
  | 'PRODUCT_TRUTH'
  | 'CONTRADICTION'
  | 'SEO'
  | 'MEDIA'
  | 'IDENTITY'
  | 'VARIANTS'
  | 'CATALOG'
  | 'PUBLISHING_READINESS';

export type RecommendationImpact = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MerchantEffort = 'TRIVIAL' | 'SMALL' | 'MEDIUM' | 'LARGE';
export type RecommendationPlanPriority = 1 | 2 | 3 | 4 | 5;
export type RecommendationBlockingStatus = 'BLOCKER' | 'BLOCKED' | 'NON_BLOCKING';
export type PublishingReadiness =
  | 'READY'
  | 'REVIEW_RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';

export interface Recommendation {
  readonly id: string;
  readonly category: RecommendationCategory;
  readonly title: string;
  readonly explanation: string;
  readonly severity: IssueSeverity;
  readonly priority: RecommendationPlanPriority;
  readonly confidence: ConfidenceResult;
  readonly estimatedImpact: RecommendationImpact;
  readonly estimatedEffort: MerchantEffort;
  readonly blockingStatus: RecommendationBlockingStatus;
  readonly dependencies: readonly string[];
  readonly relatedIssueIds: readonly string[];
  readonly relatedTruthFindingIds: readonly string[];
  readonly relatedContradictionIds: readonly string[];
  readonly affectedProductIds: readonly string[];
  readonly affectedFields: readonly string[];
  readonly fingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface RecommendationGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: RecommendationCategory;
  readonly recommendations: readonly Recommendation[];
  readonly estimatedEffort: MerchantEffort;
  readonly estimatedImpact: RecommendationImpact;
  readonly completionDependencies: readonly string[];
  readonly fingerprint: string;
}

export interface RecommendationPlanSummary {
  readonly blockerCount: number;
  readonly quickWinCount: number;
  readonly recommendationCount: number;
  readonly groupCount: number;
  readonly estimatedMerchantEffort: MerchantEffort;
  readonly publishingReadiness: PublishingReadiness;
}

export interface RecommendationPlan {
  readonly schemaVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly productsAnalyzed: number;
  readonly totalRecommendations: number;
  readonly groupedRecommendations: readonly RecommendationGroup[];
  readonly executionOrder: readonly string[];
  readonly highestPriority: RecommendationPlanPriority | null;
  readonly blockers: readonly Recommendation[];
  readonly quickWins: readonly Recommendation[];
  readonly longTermImprovements: readonly Recommendation[];
  readonly summary: RecommendationPlanSummary;
  readonly fingerprint: string;
  readonly createdAt: string;
}

export type RecommendationPlanQualityStatus =
  | 'READY'
  | 'REVIEW_RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED';
