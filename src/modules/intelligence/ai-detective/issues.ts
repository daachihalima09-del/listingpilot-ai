import type { IntelligenceHasher } from '../deterministic/services.ts';
import type {
  IntelligenceContext,
  IntelligenceIssue,
  IssueScope,
} from '../domain/types.ts';
import { AI_DETECTIVE_VERSION } from './configuration.ts';
import type { Contradiction, ContradictionType } from './types.ts';

export const AI_DETECTIVE_ISSUE_CODES: Readonly<Record<ContradictionType, string>> = Object.freeze({
  VALUE_CONFLICT: 'detective.value_conflict',
  DUPLICATE_IDENTITY: 'detective.duplicate_identity',
  IMPOSSIBLE_COMBINATION: 'detective.impossible_combination',
  SUSPICIOUS_COMBINATION: 'detective.suspicious_combination',
  WEAK_EVIDENCE: 'detective.weak_evidence',
  TRUTH_LISTING_MISMATCH: 'detective.truth_listing_mismatch',
});

const issueTitles: Readonly<Record<ContradictionType, string>> = Object.freeze({
  VALUE_CONFLICT: 'Product facts conflict',
  DUPLICATE_IDENTITY: 'Product identity is duplicated',
  IMPOSSIBLE_COMBINATION: 'Product facts form an impossible combination',
  SUSPICIOUS_COMBINATION: 'Product facts form a suspicious combination',
  WEAK_EVIDENCE: 'A product fact relies on conflicting evidence',
  TRUTH_LISTING_MISMATCH: 'The listing differs from Product Truth',
});

function scopeFor(contradiction: Contradiction): IssueScope {
  if (contradiction.affectedProductIds.length > 1) return 'CATALOG';
  if (contradiction.affectedVariantIds.length > 0) return 'VARIANT';
  return contradiction.involvedClaims.length > 0 ? 'FIELD' : 'PRODUCT';
}

export function detectiveIssueId(
  contradiction: Contradiction,
  hasher: IntelligenceHasher,
): string {
  return `detective_issue_${hasher.hash({
    contradictionId: contradiction.id,
    ruleId: contradiction.ruleId,
    fingerprint: contradiction.fingerprint,
  })}`;
}

export function createAIDetectiveIssues(input: {
  readonly contradictions: readonly Contradiction[];
  readonly context: IntelligenceContext;
  readonly detectorId: string;
  readonly hasher: IntelligenceHasher;
}): readonly IntelligenceIssue[] {
  return [...input.contradictions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((contradiction): IntelligenceIssue => ({
      id: detectiveIssueId(contradiction, input.hasher),
      fingerprint: input.hasher.hash({
        contradictionFingerprint: contradiction.fingerprint,
        issueCode: AI_DETECTIVE_ISSUE_CODES[contradiction.type],
      }),
      detectorId: input.detectorId,
      detectorVersion: AI_DETECTIVE_VERSION,
      code: AI_DETECTIVE_ISSUE_CODES[contradiction.type],
      title: issueTitles[contradiction.type],
      explanation: contradiction.explanation,
      category: 'PRODUCT_TRUTH',
      severity: contradiction.severity,
      status: 'OPEN',
      scope: scopeFor(contradiction),
      affectedProductIds: contradiction.affectedProductIds,
      affectedVariantIds: contradiction.affectedVariantIds,
      affectedFields: [...new Set(
        contradiction.involvedClaims.map(({ fieldPath }) => fieldPath),
      )].sort(),
      evidenceIds: contradiction.involvedEvidenceIds,
      confidence: contradiction.confidence,
      recommendationIds: contradiction.recommendationIds,
      metadata: {
        semanticDetectorId: `ai-detective:${contradiction.ruleId}`,
        capabilityId: 'ai-detective',
        capabilityVersion: AI_DETECTIVE_VERSION,
        contradictionId: contradiction.id,
        contradictionType: contradiction.type,
        contradictionFingerprint: contradiction.fingerprint,
        ruleId: contradiction.ruleId,
        ruleVersion: contradiction.ruleVersion,
        truthFindingIds: contradiction.involvedTruthFindingIds,
        involvedClaims: contradiction.involvedClaims,
        recommendationTemplate: contradiction.metadata.recommendationTemplate,
        detectorFamily: contradiction.metadata.detectorFamily,
        whyMerchantShouldCare: contradiction.explanation,
        deterministic: true,
      },
      createdAt: input.context.execution.requestedAt,
    }));
}
