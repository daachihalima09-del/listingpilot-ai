import type {
  ConfidenceResult,
  ExtensionMetadata,
  IssueSeverity,
} from '../domain/types.ts';
import type { TruthReviewRequirement } from '../product-truth/types.ts';

export type ContradictionType =
  | 'VALUE_CONFLICT'
  | 'DUPLICATE_IDENTITY'
  | 'IMPOSSIBLE_COMBINATION'
  | 'SUSPICIOUS_COMBINATION'
  | 'WEAK_EVIDENCE'
  | 'TRUTH_LISTING_MISMATCH';

export type DetectiveFindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface ContradictionClaimReference {
  readonly productId: string;
  readonly variantId?: string;
  readonly namespace: string;
  readonly key: string;
  readonly fieldPath: string;
  readonly displayValue?: string;
  readonly source: 'PRODUCT_TRUTH' | 'NORMALIZED_FIELD';
  readonly metadata: ExtensionMetadata;
}

export interface Contradiction {
  readonly id: string;
  readonly productId: string;
  readonly affectedProductIds: readonly string[];
  readonly variantId?: string;
  readonly affectedVariantIds: readonly string[];
  readonly type: ContradictionType;
  readonly severity: IssueSeverity;
  readonly confidence: ConfidenceResult;
  readonly explanation: string;
  readonly involvedClaims: readonly ContradictionClaimReference[];
  readonly involvedTruthFindingIds: readonly string[];
  readonly involvedEvidenceIds: readonly string[];
  readonly recommendationIds: readonly string[];
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly fingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface DetectiveFinding {
  readonly id: string;
  readonly contradiction: Contradiction;
  readonly status: DetectiveFindingStatus;
  readonly reviewRequirement: TruthReviewRequirement;
  readonly confidence: ConfidenceResult;
  readonly explanation: string;
  readonly recommendationIds: readonly string[];
  readonly fingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface DetectiveReport {
  readonly schemaVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly productsAnalyzed: number;
  readonly contradictionsFound: number;
  readonly contradictionsBySeverity: Readonly<Record<IssueSeverity, number>>;
  readonly contradictionsByType: Readonly<Record<ContradictionType, number>>;
  readonly blockedProducts: readonly string[];
  readonly reviewRequired: number;
  readonly findings: readonly DetectiveFinding[];
  readonly warnings: readonly string[];
  readonly fingerprint: string;
  readonly createdAt: string;
}

export interface AIDetectiveAnalysis {
  readonly contradictions: readonly Contradiction[];
  readonly findings: readonly DetectiveFinding[];
  readonly report: DetectiveReport;
  readonly issues: readonly import('../domain/types.ts').IntelligenceIssue[];
  readonly warnings: readonly string[];
}

export type DetectiveQualityStatus = 'CLEAR' | 'REVIEW_RECOMMENDED' | 'REVIEW_REQUIRED' | 'BLOCKED';
