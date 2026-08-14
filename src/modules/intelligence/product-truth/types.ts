import type {
  AnalysisScope,
  ConfidenceResult,
  ExtensionMetadata,
  SourceReference,
  ValueType,
} from '../domain/types.ts';

export type ClaimOrigin =
  | 'NORMALIZED_PRODUCT'
  | 'SOURCE_IMPORT'
  | 'MERCHANT_SUPPLIED'
  | 'MANUFACTURER_SUPPLIED'
  | 'RETAILER_SUPPLIED'
  | 'DOCUMENT_SUPPLIED'
  | 'HUMAN_REVIEWER'
  | 'AI_DERIVED'
  | 'UNKNOWN';

export type TruthResolutionStatus =
  | 'VERIFIED'
  | 'LIKELY'
  | 'CONFLICTED'
  | 'UNRESOLVED'
  | 'INSUFFICIENT_EVIDENCE'
  | 'MERCHANT_OVERRIDE'
  | 'NOT_APPLICABLE';

export type TruthReviewRequirement = 'NONE' | 'OPTIONAL' | 'REQUIRED' | 'BLOCKING';
export type ClaimComparisonResult = 'EQUIVALENT' | 'COMPATIBLE' | 'CONFLICTING' | 'INCOMPARABLE';
export type ClaimImportance = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export type TruthConfidenceMeaning = 'SELECTED_CANDIDATE' | 'RESOLUTION_STATUS';

export type EvidenceAuthorityLevel =
  | 'MERCHANT_OVERRIDE'
  | 'MANUFACTURER_STRUCTURED'
  | 'MANUFACTURER_DOCUMENT'
  | 'AUTHORITATIVE_DISTRIBUTOR'
  | 'RETAILER_STRUCTURED'
  | 'MERCHANT_LISTING'
  | 'HUMAN_REVIEWED'
  | 'AI_DERIVED'
  | 'UNKNOWN';

export interface ProductClaim {
  readonly id: string;
  readonly productId: string;
  readonly variantId?: string;
  readonly namespace: string;
  readonly key: string;
  readonly displayLabel: string;
  readonly affectedFieldPath: string;
  readonly rawValue: unknown;
  readonly normalizedCandidateValue: unknown;
  readonly valueType: ValueType;
  readonly unit?: string;
  readonly evidenceIds: readonly string[];
  readonly sourceReferences: readonly SourceReference[];
  readonly origin: ClaimOrigin;
  readonly importance: ClaimImportance;
  readonly createdAt: string;
  readonly metadata: ExtensionMetadata;
}

export interface TruthAuthoritySummary {
  readonly strongestLevel: EvidenceAuthorityLevel;
  readonly strongestWeight: number;
  readonly authorityLevels: Readonly<Record<EvidenceAuthorityLevel, number>>;
}

export interface TruthFreshnessSummary {
  readonly minimum: number;
  readonly maximum: number;
  readonly average: number;
  readonly staleEvidenceCount: number;
}

export interface TruthCandidate {
  readonly id: string;
  readonly canonicalValue: string;
  readonly displayValue: string;
  readonly valueType: ValueType;
  readonly unit?: string;
  readonly supportingClaimIds: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
  readonly sourceDiversity: number;
  readonly evidenceCount: number;
  readonly sourceCount: number;
  readonly authoritySummary: TruthAuthoritySummary;
  readonly freshnessSummary: TruthFreshnessSummary;
  readonly confidenceContribution: number;
  readonly metadata: ExtensionMetadata;
}

export interface TruthClaimGroup {
  readonly id: string;
  readonly productId: string;
  readonly variantId?: string;
  readonly namespace: string;
  readonly key: string;
  readonly displayLabel: string;
  readonly affectedFieldPath: string;
  readonly importance: ClaimImportance;
  readonly claimIds: readonly string[];
  readonly candidates: readonly TruthCandidate[];
  readonly evidenceIds: readonly string[];
  readonly fingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface TruthResolution {
  readonly id: string;
  readonly claimGroupId: string;
  readonly productId: string;
  readonly variantId?: string;
  readonly status: TruthResolutionStatus;
  readonly selectedCandidateId?: string;
  readonly selectedValue?: string;
  readonly confidence: ConfidenceResult;
  readonly confidenceMeaning: TruthConfidenceMeaning;
  readonly explanation: string;
  readonly contributingFactors: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
  readonly conflictingEvidenceIds: readonly string[];
  readonly reviewRequirement: TruthReviewRequirement;
  readonly strategyId: string;
  readonly strategyVersion: string;
  readonly knowledgePackVersions: readonly string[];
  readonly capabilityVersion: string;
  readonly createdAt: string;
  readonly metadata: ExtensionMetadata;
}

export interface TruthEvidenceSummary {
  readonly evidenceCount: number;
  readonly independentSourceCount: number;
  readonly strongestAuthority: EvidenceAuthorityLevel;
  readonly missingProvenanceCount: number;
}

export interface TruthConflictSummary {
  readonly materiallySupportedCandidateCount: number;
  readonly conflictingEvidenceCount: number;
  readonly hasMaterialConflict: boolean;
}

export interface TruthFinding {
  readonly id: string;
  readonly productId: string;
  readonly variantId?: string;
  readonly claimGroupId: string;
  readonly fieldPath: string;
  readonly claimLabel: string;
  readonly importance: ClaimImportance;
  readonly status: TruthResolutionStatus;
  readonly selectedValue?: string;
  readonly candidateValues: readonly string[];
  readonly confidence: ConfidenceResult;
  readonly confidenceMeaning: TruthConfidenceMeaning;
  readonly evidenceSummary: TruthEvidenceSummary;
  readonly conflictSummary: TruthConflictSummary;
  readonly explanation: string;
  readonly reviewRequirement: TruthReviewRequirement;
  readonly associatedIssueIds: readonly string[];
  readonly associatedRecommendationIds: readonly string[];
  readonly deterministicFingerprint: string;
  readonly metadata: ExtensionMetadata;
}

export interface ProductTruthReport {
  readonly schemaVersion: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly analysisScope: AnalysisScope;
  readonly productCount: number;
  readonly claimCount: number;
  readonly claimGroupCount: number;
  readonly resolvedCount: number;
  readonly verifiedCount: number;
  readonly likelyCount: number;
  readonly conflictedCount: number;
  readonly unresolvedCount: number;
  readonly insufficientEvidenceCount: number;
  readonly merchantOverrideCount: number;
  readonly notApplicableCount: number;
  readonly findings: readonly TruthFinding[];
  readonly productIntelligence?: readonly import('../../product-intelligence/domain/contracts.ts').ProductIntelligenceAnalysisResult[];
  readonly confidenceDistribution: Readonly<Record<string, number>>;
  readonly evidenceSourceDistribution: Readonly<Record<string, number>>;
  readonly resolutionStrategyStatistics: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly deterministicFingerprint: string;
  readonly createdAt: string;
}

export interface TruthComparison {
  readonly result: ClaimComparisonResult;
  readonly explanation: string;
  readonly confidenceImpact: number;
  readonly metadata: ExtensionMetadata;
}

export interface ProductTruthAnalysis {
  readonly claims: readonly ProductClaim[];
  readonly groups: readonly TruthClaimGroup[];
  readonly resolutions: readonly TruthResolution[];
  readonly report: ProductTruthReport;
  readonly issues: readonly import('../domain/types.ts').IntelligenceIssue[];
  readonly warnings: readonly string[];
}

export type ProductTruthQualityStatus =
  | 'TRUSTED'
  | 'REVIEW_RECOMMENDED'
  | 'REVIEW_REQUIRED'
  | 'BLOCKED'
  | 'NO_EVIDENCE';
