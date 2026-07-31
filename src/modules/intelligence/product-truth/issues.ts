import type {
  IntelligenceContext,
  IntelligenceIssue,
  IssueSeverity,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import { PRODUCT_TRUTH_VERSION } from './configuration.ts';
import type {
  ClaimImportance,
  TruthCandidate,
  TruthClaimGroup,
  TruthResolution,
} from './types.ts';

export const PRODUCT_TRUTH_ISSUE_CODES = Object.freeze([
  'truth.claim.conflicted',
  'truth.claim.unresolved',
  'truth.evidence.insufficient',
  'truth.evidence.provenance_missing',
  'truth.resolution.low_confidence',
  'truth.override.conflicted',
] as const);

export type ProductTruthIssueCode = typeof PRODUCT_TRUTH_ISSUE_CODES[number];

interface TruthIssueSpec {
  readonly code: ProductTruthIssueCode;
  readonly title: string;
  readonly explanation: string;
  readonly evidenceIds: readonly string[];
}

const importanceRank: Readonly<Record<ClaimImportance, number>> = {
  INFORMATIONAL: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function issueSeverity(
  importance: ClaimImportance,
  code: ProductTruthIssueCode,
): IssueSeverity {
  if (code === 'truth.evidence.provenance_missing' || code === 'truth.resolution.low_confidence') {
    return importanceRank[importance] >= importanceRank.HIGH ? 'MEDIUM' : 'LOW';
  }
  if (importance === 'CRITICAL') return 'CRITICAL';
  if (importance === 'HIGH') return 'HIGH';
  if (importance === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function selectedCandidate(
  group: TruthClaimGroup,
  resolution: TruthResolution,
): TruthCandidate | undefined {
  return group.candidates.find(({ id }) => id === resolution.selectedCandidateId);
}

function issueSpecs(input: {
  readonly group: TruthClaimGroup;
  readonly resolution: TruthResolution;
  readonly configuration: ProductTruthConfiguration;
}): TruthIssueSpec[] {
  const { group, resolution, configuration } = input;
  const specs: TruthIssueSpec[] = [];
  if (resolution.status === 'CONFLICTED') {
    specs.push({
      code: 'truth.claim.conflicted',
      title: 'Product truth claim is conflicted',
      explanation: resolution.explanation,
      evidenceIds: resolution.conflictingEvidenceIds,
    });
  }
  if (resolution.status === 'UNRESOLVED') {
    specs.push({
      code: 'truth.claim.unresolved',
      title: 'Product truth claim is unresolved',
      explanation: resolution.explanation,
      evidenceIds: resolution.conflictingEvidenceIds,
    });
  }
  if (resolution.status === 'INSUFFICIENT_EVIDENCE'
    && importanceRank[group.importance] >= importanceRank[configuration.insufficientEvidenceIssueMinimumImportance]) {
    specs.push({
      code: 'truth.evidence.insufficient',
      title: 'Product truth evidence is insufficient',
      explanation: resolution.explanation,
      evidenceIds: group.evidenceIds,
    });
  }
  const missingProvenanceIds = group.candidates
    .filter((candidate) => Number(candidate.metadata.missingProvenanceCount ?? 0) > 0)
    .flatMap(({ supportingEvidenceIds }) => supportingEvidenceIds);
  if (missingProvenanceIds.length > 0) {
    specs.push({
      code: 'truth.evidence.provenance_missing',
      title: 'Product truth evidence has missing provenance',
      explanation: 'One or more supporting evidence records have no traceable source provenance.',
      evidenceIds: [...new Set(missingProvenanceIds)].sort(),
    });
  }
  if (resolution.status === 'LIKELY'
    && resolution.confidence.value < configuration.lowConfidenceIssueThreshold) {
    specs.push({
      code: 'truth.resolution.low_confidence',
      title: 'Product truth resolution has limited confidence',
      explanation: 'A candidate is likely, but stronger or more independent evidence is required for verification.',
      evidenceIds: resolution.supportingEvidenceIds,
    });
  }
  if (resolution.status === 'MERCHANT_OVERRIDE' && resolution.conflictingEvidenceIds.length > 0) {
    specs.push({
      code: 'truth.override.conflicted',
      title: 'Merchant override conflicts with evidence',
      explanation: 'The explicit merchant override conflicts with materially supported external evidence.',
      evidenceIds: [...new Set([
        ...resolution.supportingEvidenceIds,
        ...resolution.conflictingEvidenceIds,
      ])].sort(),
    });
  }
  return specs;
}

export function productTruthRecommendationId(
  issue: Pick<IntelligenceIssue, 'id' | 'code' | 'affectedFields'>,
  hasher: IntelligenceHasher,
): string {
  return `truth_recommendation_${hasher.hash({
    issueId: issue.id,
    code: issue.code,
    fields: [...issue.affectedFields].sort(),
  })}`;
}

export function createProductTruthIssues(input: {
  readonly groups: readonly TruthClaimGroup[];
  readonly resolutions: readonly TruthResolution[];
  readonly context: IntelligenceContext;
  readonly configuration: ProductTruthConfiguration;
  readonly hasher: IntelligenceHasher;
  readonly detectorId: string;
  readonly detectorVersion?: string;
}): readonly IntelligenceIssue[] {
  const resolutions = new Map(input.resolutions.map((resolution) => [resolution.claimGroupId, resolution]));
  return input.groups.flatMap((group) => {
    const resolution = resolutions.get(group.id);
    if (!resolution) return [];
    return issueSpecs({ group, resolution, configuration: input.configuration }).map((spec) => {
      const identity = {
        code: spec.code,
        groupId: group.id,
        status: resolution.status,
        strategyId: resolution.strategyId,
      };
      const issue: IntelligenceIssue = {
        id: `truth_issue_${input.hasher.hash(identity)}`,
        fingerprint: '',
        detectorId: input.detectorId,
        detectorVersion: input.detectorVersion ?? PRODUCT_TRUTH_VERSION,
        code: spec.code,
        title: spec.title,
        explanation: spec.explanation,
        category: 'PRODUCT_TRUTH',
        severity: issueSeverity(group.importance, spec.code),
        status: 'OPEN',
        scope: 'FIELD',
        affectedProductIds: [group.productId],
        affectedVariantIds: group.variantId ? [group.variantId] : [],
        affectedFields: [group.affectedFieldPath],
        evidenceIds: [...new Set(spec.evidenceIds)].sort(),
        confidence: resolution.confidence,
        recommendationIds: [],
        metadata: {
          semanticDetectorId: `product-truth:${spec.code}:${group.id}`,
          claimGroupId: group.id,
          claimLabel: group.displayLabel,
          candidateValues: group.candidates.map(({ displayValue }) => displayValue),
          resolutionStatus: resolution.status,
          confidenceMeaning: resolution.confidenceMeaning,
          reviewRequirement: resolution.reviewRequirement,
          resolutionStrategyId: resolution.strategyId,
          resolutionStrategyVersion: resolution.strategyVersion,
          capabilityVersion: resolution.capabilityVersion,
          importance: group.importance,
          selectedCandidateId: selectedCandidate(group, resolution)?.id ?? null,
          deterministic: true,
        },
        createdAt: input.context.execution.requestedAt,
      };
      return {
        ...issue,
        recommendationIds: [productTruthRecommendationId(issue, input.hasher)],
      };
    });
  }).sort((left, right) => left.id.localeCompare(right.id));
}
