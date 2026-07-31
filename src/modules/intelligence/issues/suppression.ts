import { immutableCopy } from '../domain/immutability.ts';
import type {
  Evidence,
  EvidenceReliability,
  IntelligenceIssue,
  IssueSeverity,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';

const severityRank: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const reliabilityRank: Readonly<Record<EvidenceReliability, number>> = {
  UNKNOWN: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  OFFICIAL: 4,
};

function normalizedClaim(evidence: Evidence): string {
  return `${evidence.claim.trim().toLocaleLowerCase()}|${evidence.affectedField?.trim().toLocaleLowerCase() ?? ''}`;
}

export function issueSemanticFingerprint(
  issue: IntelligenceIssue,
  evidenceById: ReadonlyMap<string, Evidence>,
  hasher: IntelligenceHasher,
): string {
  const semanticDetector = typeof issue.metadata.semanticDetectorId === 'string'
    ? issue.metadata.semanticDetectorId
    : issue.code;
  const claims = issue.evidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is Evidence => Boolean(item))
    .map(normalizedClaim)
    .sort();
  return hasher.hash({
    code: issue.code,
    semanticDetector,
    scope: issue.scope,
    affectedProductIds: [...new Set(issue.affectedProductIds)].sort(),
    affectedVariantIds: [...new Set(issue.affectedVariantIds)].sort(),
    affectedFields: [...new Set(issue.affectedFields.map((field) => field.trim().toLocaleLowerCase()))].sort(),
    claims,
  });
}

function evidenceStrength(evidence: Evidence | undefined): number {
  if (!evidence) return -1;
  return reliabilityRank[evidence.reliability] * 1_000_000
    + Math.round(evidence.freshness * 100_000)
    + evidence.priority;
}

function mergeGroup(
  group: readonly IntelligenceIssue[],
  fingerprint: string,
  evidenceById: ReadonlyMap<string, Evidence>,
): IntelligenceIssue {
  const canonical = [...group].sort((left, right) => (
    severityRank[right.severity] - severityRank[left.severity]
    || right.evidenceIds.reduce((sum, id) => sum + evidenceStrength(evidenceById.get(id)), 0)
      - left.evidenceIds.reduce((sum, id) => sum + evidenceStrength(evidenceById.get(id)), 0)
    || left.detectorId.localeCompare(right.detectorId)
    || left.id.localeCompare(right.id)
  ))[0];
  const evidenceIds = [...new Set(group.flatMap((issue) => issue.evidenceIds))]
    .sort((left, right) => (
      evidenceStrength(evidenceById.get(right)) - evidenceStrength(evidenceById.get(left))
      || left.localeCompare(right)
    ));
  const originatingDetectorIds = [...new Set(group.map(({ detectorId }) => detectorId))].sort();
  const originatingIssueIds = [...new Set(group.map(({ id }) => id))].sort();
  return {
    ...canonical,
    fingerprint,
    evidenceIds,
    recommendationIds: [...new Set(group.flatMap(({ recommendationIds }) => recommendationIds))].sort(),
    metadata: {
      ...canonical.metadata,
      originatingDetectorIds,
      originatingIssueIds,
      suppressedDuplicateCount: Math.max(0, group.length - 1),
    },
  };
}

export interface DuplicateSuppressionResult {
  readonly issues: readonly IntelligenceIssue[];
  readonly suppressedCount: number;
}

/**
 * Merge policy: semantic fingerprints group issues; the highest-severity issue is
 * canonical, strongest evidence is ordered first, and all source issue/detector IDs
 * remain in metadata. Inputs are never mutated.
 */
export function suppressDuplicateIssues(input: {
  readonly issues: readonly IntelligenceIssue[];
  readonly evidence: readonly Evidence[];
  readonly hasher: IntelligenceHasher;
}): DuplicateSuppressionResult {
  const evidenceById = new Map(input.evidence.map((item) => [item.id, item]));
  const groups = new Map<string, IntelligenceIssue[]>();
  for (const issue of input.issues) {
    const fingerprint = issueSemanticFingerprint(issue, evidenceById, input.hasher);
    const group = groups.get(fingerprint) ?? [];
    group.push(issue);
    groups.set(fingerprint, group);
  }
  const issues = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fingerprint, group]) => mergeGroup(group, fingerprint, evidenceById));
  return immutableCopy({
    issues,
    suppressedCount: input.issues.length - issues.length,
  }) as DuplicateSuppressionResult;
}
