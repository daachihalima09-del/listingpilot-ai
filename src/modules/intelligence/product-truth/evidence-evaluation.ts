import { immutableCopy } from '../domain/immutability.ts';
import type {
  Evidence,
  EvidenceProviderType,
  EvidenceReliability,
} from '../domain/types.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import type {
  ClaimOrigin,
  EvidenceAuthorityLevel,
  ProductClaim,
  TruthCandidate,
  TruthClaimGroup,
} from './types.ts';

const authorityLevels: readonly EvidenceAuthorityLevel[] = [
  'MERCHANT_OVERRIDE',
  'MANUFACTURER_STRUCTURED',
  'MANUFACTURER_DOCUMENT',
  'AUTHORITATIVE_DISTRIBUTOR',
  'RETAILER_STRUCTURED',
  'MERCHANT_LISTING',
  'HUMAN_REVIEWED',
  'AI_DERIVED',
  'UNKNOWN',
];

interface EvaluatedEvidence {
  readonly evidence: Evidence;
  readonly sourceIdentity: string;
  readonly authority: EvidenceAuthorityLevel;
  readonly authorityWeight: number;
  readonly reliabilityWeight: number;
  readonly score: number;
  readonly missingProvenance: boolean;
  readonly aiDerived: boolean;
  readonly merchantListing: boolean;
  readonly merchantOverride: boolean;
}

export interface ProductTruthEvidenceEvaluation {
  readonly groups: readonly TruthClaimGroup[];
  readonly evidenceSourceDistribution: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
}

function metadataString(evidence: Evidence, key: string): string | undefined {
  const value = evidence.metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function providerType(evidence: Evidence): EvidenceProviderType | undefined {
  const value = metadataString(evidence, 'providerType');
  const types: readonly EvidenceProviderType[] = [
    'MERCHANT', 'MANUFACTURER', 'RETAILER', 'DOCUMENT', 'HUMAN', 'AI_DERIVED', 'OTHER',
  ];
  return value && types.includes(value as EvidenceProviderType)
    ? value as EvidenceProviderType
    : undefined;
}

function authorityFromOrigin(origin: ClaimOrigin | undefined): EvidenceAuthorityLevel {
  switch (origin) {
    case 'MERCHANT_SUPPLIED':
    case 'NORMALIZED_PRODUCT': return 'MERCHANT_LISTING';
    case 'MANUFACTURER_SUPPLIED': return 'MANUFACTURER_STRUCTURED';
    case 'RETAILER_SUPPLIED': return 'RETAILER_STRUCTURED';
    case 'DOCUMENT_SUPPLIED': return 'MANUFACTURER_DOCUMENT';
    case 'HUMAN_REVIEWER': return 'HUMAN_REVIEWED';
    case 'AI_DERIVED': return 'AI_DERIVED';
    default: return 'UNKNOWN';
  }
}

function authorityLevel(evidence: Evidence, origin: ClaimOrigin | undefined): EvidenceAuthorityLevel {
  if (evidence.metadata.merchantApprovedOverride === true) return 'MERCHANT_OVERRIDE';
  const configured = metadataString(evidence, 'authorityLevel');
  if (configured && authorityLevels.includes(configured as EvidenceAuthorityLevel)) {
    return configured as EvidenceAuthorityLevel;
  }
  const type = providerType(evidence);
  if (type === 'MANUFACTURER') {
    return evidence.metadata.structured === true ? 'MANUFACTURER_STRUCTURED' : 'MANUFACTURER_DOCUMENT';
  }
  if (type === 'RETAILER') return 'RETAILER_STRUCTURED';
  if (type === 'MERCHANT') return 'MERCHANT_LISTING';
  if (type === 'HUMAN') return 'HUMAN_REVIEWED';
  if (type === 'AI_DERIVED') return 'AI_DERIVED';
  if (type === 'DOCUMENT' && evidence.reliability === 'OFFICIAL') return 'MANUFACTURER_DOCUMENT';
  return authorityFromOrigin(origin);
}

function sourceIdentity(evidence: Evidence): string {
  const explicit = metadataString(evidence, 'sourceIdentity');
  if (explicit) return explicit.toLocaleLowerCase();
  const reference = evidence.sourceReference;
  const parent = reference?.externalParentId?.trim();
  if (parent) return `${evidence.providerId}|${parent}`.toLocaleLowerCase();
  // Provider identity is deliberately conservative: multiple pages copied from
  // one provider do not become independent confirmation by default.
  return evidence.providerId.trim().toLocaleLowerCase();
}

function evidenceScore(input: {
  readonly evidence: Evidence;
  readonly authority: EvidenceAuthorityLevel;
  readonly configuration: ProductTruthConfiguration;
}): number {
  const authority = input.configuration.authorityWeights[input.authority];
  const reliability = input.configuration.reliabilityWeights[input.evidence.reliability];
  const freshness = input.configuration.freshness.enabled ? input.evidence.freshness : 1;
  const directness = input.evidence.metadata.direct === false ? 0.65 : 1;
  const structured = input.evidence.metadata.structured === true ? 1 : 0.8;
  const freshnessWeight = input.configuration.freshness.weight;
  const divisor = 0.4 + 0.25 + freshnessWeight + 0.1 + 0.1;
  let score = (
    authority * 0.4
    + reliability * 0.25
    + freshness * freshnessWeight
    + directness * 0.1
    + structured * 0.1
  ) / divisor;
  if (input.authority === 'AI_DERIVED') score -= input.configuration.aiDerivedPenalty;
  return Math.max(0, Math.min(input.configuration.maximumConfidence, score));
}

function evaluateEvidence(
  evidence: Evidence,
  origin: ClaimOrigin | undefined,
  configuration: ProductTruthConfiguration,
): EvaluatedEvidence {
  const authority = authorityLevel(evidence, origin);
  const missingProvenance = !evidence.sourceReference && !metadataString(evidence, 'sourceIdentity');
  return {
    evidence,
    sourceIdentity: sourceIdentity(evidence),
    authority,
    authorityWeight: configuration.authorityWeights[authority],
    reliabilityWeight: configuration.reliabilityWeights[evidence.reliability],
    score: evidenceScore({ evidence, authority, configuration }),
    missingProvenance,
    aiDerived: authority === 'AI_DERIVED',
    merchantListing: authority === 'MERCHANT_LISTING',
    merchantOverride: authority === 'MERCHANT_OVERRIDE',
  };
}

function strongestPerSource(
  evaluated: readonly EvaluatedEvidence[],
  configuration: ProductTruthConfiguration,
): readonly EvaluatedEvidence[] {
  const groups = new Map<string, EvaluatedEvidence[]>();
  for (const item of evaluated) {
    const group = groups.get(item.sourceIdentity) ?? [];
    group.push(item);
    groups.set(item.sourceIdentity, group);
  }
  return [...groups.values()].flatMap((group) => {
    const ordered = [...group].sort((left, right) => (
      right.score - left.score || left.evidence.id.localeCompare(right.evidence.id)
    ));
    if (configuration.duplicateSourceTreatment === 'STRONGEST_ONLY') return ordered.slice(0, 1);
    return ordered.map((item, index) => ({
      ...item,
      score: item.score / (index + 1),
    }));
  });
}

function authorityCounts(evaluated: readonly EvaluatedEvidence[]): Record<EvidenceAuthorityLevel, number> {
  return Object.fromEntries(authorityLevels.map((level) => [
    level,
    evaluated.filter(({ authority }) => authority === level).length,
  ])) as Record<EvidenceAuthorityLevel, number>;
}

function strongestAuthority(
  evaluated: readonly EvaluatedEvidence[],
  configuration: ProductTruthConfiguration,
): EvidenceAuthorityLevel {
  return [...evaluated].sort((left, right) => (
    configuration.authorityWeights[right.authority] - configuration.authorityWeights[left.authority]
    || left.authority.localeCompare(right.authority)
  ))[0]?.authority ?? 'UNKNOWN';
}

function candidateWithEvaluation(input: {
  readonly candidate: TruthCandidate;
  readonly claims: ReadonlyMap<string, ProductClaim>;
  readonly evidence: ReadonlyMap<string, Evidence>;
  readonly configuration: ProductTruthConfiguration;
}): TruthCandidate {
  const supportingClaims = input.candidate.supportingClaimIds
    .map((id) => input.claims.get(id))
    .filter((claim): claim is ProductClaim => Boolean(claim));
  const originByEvidence = new Map<string, ClaimOrigin>();
  for (const claim of supportingClaims) {
    for (const evidenceId of claim.evidenceIds) {
      if (!originByEvidence.has(evidenceId)) originByEvidence.set(evidenceId, claim.origin);
    }
  }
  const allEvidence = input.candidate.supportingEvidenceIds
    .map((id) => input.evidence.get(id))
    .filter((item): item is Evidence => Boolean(item))
    .map((item) => evaluateEvidence(item, originByEvidence.get(item.id), input.configuration));
  const independent = strongestPerSource(allEvidence, input.configuration);
  const strongest = [...independent].sort((left, right) => (
    right.score - left.score || left.evidence.id.localeCompare(right.evidence.id)
  ))[0];
  const diversityBonus = Math.min(
    0.2,
    Math.max(0, new Set(independent.map(({ sourceIdentity: identity }) => identity)).size - 1)
      * input.configuration.sourceDiversityWeight,
  );
  let contribution = Math.min(
    input.configuration.maximumConfidence,
    (strongest?.score ?? 0) + diversityBonus,
  );
  const missingProvenanceCount = allEvidence.filter(({ missingProvenance }) => missingProvenance).length;
  const aiOnly = allEvidence.length > 0 && allEvidence.every(({ aiDerived }) => aiDerived);
  const merchantListingOnly = allEvidence.length > 0 && allEvidence.every(({ merchantListing }) => merchantListing);
  if (missingProvenanceCount > 0) {
    contribution = Math.min(contribution, input.configuration.missingProvenanceConfidenceCeiling);
  }
  if (aiOnly) contribution = Math.min(contribution, input.configuration.aiOnlyConfidenceCeiling);
  if (merchantListingOnly) {
    contribution = Math.min(contribution, input.configuration.merchantListingOnlyConfidenceCeiling);
  }
  const freshness = allEvidence.map(({ evidence }) => evidence.freshness);
  const strongestLevel = strongestAuthority(allEvidence, input.configuration);
  const sourceCount = new Set(independent.map(({ sourceIdentity: identity }) => identity)).size;
  return {
    ...input.candidate,
    sourceDiversity: sourceCount,
    evidenceCount: allEvidence.length,
    sourceCount,
    authoritySummary: {
      strongestLevel,
      strongestWeight: input.configuration.authorityWeights[strongestLevel],
      authorityLevels: authorityCounts(allEvidence),
    },
    freshnessSummary: {
      minimum: freshness.length ? Math.min(...freshness) : 0,
      maximum: freshness.length ? Math.max(...freshness) : 0,
      average: freshness.length
        ? freshness.reduce((total, value) => total + value, 0) / freshness.length
        : 0,
      staleEvidenceCount: freshness.filter((value) => value < input.configuration.freshness.staleThreshold).length,
    },
    confidenceContribution: contribution,
    metadata: {
      ...input.candidate.metadata,
      independentSourceIds: [...new Set(independent.map(({ sourceIdentity: identity }) => identity))].sort(),
      missingProvenanceCount,
      aiOnly,
      merchantListingOnly,
      merchantOverride: allEvidence.some(({ merchantOverride }) => merchantOverride)
        || supportingClaims.some(({ metadata }) => metadata.merchantApprovedOverride === true),
      evidenceScores: Object.fromEntries(allEvidence.map(({ evidence, score }) => [evidence.id, score])),
      evidenceTypes: [...new Set(allEvidence.map(({ evidence }) => evidence.type))].sort(),
      duplicateEvidenceCount: Math.max(0, allEvidence.length - independent.length),
    },
  };
}

export function evaluateProductTruthEvidence(input: {
  readonly groups: readonly TruthClaimGroup[];
  readonly claims: readonly ProductClaim[];
  readonly evidence: readonly Evidence[];
  readonly configuration: ProductTruthConfiguration;
}): ProductTruthEvidenceEvaluation {
  const claims = new Map(input.claims.map((claim) => [claim.id, claim]));
  const evidence = new Map(input.evidence.map((item) => [item.id, item]));
  const distribution = new Map<string, number>();
  for (const item of input.evidence) {
    const identity = sourceIdentity(item);
    distribution.set(identity, (distribution.get(identity) ?? 0) + 1);
  }
  const groups = input.groups.map((group) => ({
    ...group,
    candidates: group.candidates.map((candidate) => candidateWithEvaluation({
      candidate,
      claims,
      evidence,
      configuration: input.configuration,
    })),
  }));
  const unknownEvidenceIds = [...new Set(input.groups.flatMap(({ evidenceIds }) => evidenceIds))]
    .filter((id) => !evidence.has(id))
    .sort();
  return immutableCopy({
    groups,
    evidenceSourceDistribution: Object.fromEntries([...distribution.entries()].sort(([left], [right]) => (
      left.localeCompare(right)
    ))),
    warnings: unknownEvidenceIds.map((id) => `Claim references unavailable evidence ${id}.`),
  }) as ProductTruthEvidenceEvaluation;
}

export function evidenceReliabilityRank(value: EvidenceReliability): number {
  return {
    UNKNOWN: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    OFFICIAL: 4,
  }[value];
}
