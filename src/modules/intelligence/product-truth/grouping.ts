import { immutableCopy } from '../domain/immutability.ts';
import type { EvidenceAuthorityLevel, ProductClaim, TruthCandidate, TruthClaimGroup } from './types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import { normalizeTruthValue } from './normalization.ts';

export interface TruthClaimGroupingResult {
  readonly groups: readonly TruthClaimGroup[];
  readonly warnings: readonly string[];
  readonly ignoredClaimIds: readonly string[];
}

const emptyAuthorities = (): Readonly<Record<EvidenceAuthorityLevel, number>> => ({
  MERCHANT_OVERRIDE: 0,
  MANUFACTURER_STRUCTURED: 0,
  MANUFACTURER_DOCUMENT: 0,
  AUTHORITATIVE_DISTRIBUTOR: 0,
  RETAILER_STRUCTURED: 0,
  MERCHANT_LISTING: 0,
  HUMAN_REVIEWED: 0,
  AI_DERIVED: 0,
  UNKNOWN: 0,
});

function normalizedKey(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

function importanceRank(value: ProductClaim['importance']): number {
  return {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
    INFORMATIONAL: 0,
  }[value];
}

export function groupProductTruthClaims(input: {
  readonly claims: readonly ProductClaim[];
  readonly configuration: ProductTruthConfiguration;
  readonly hasher: IntelligenceHasher;
}): TruthClaimGroupingResult {
  const grouped = new Map<string, ProductClaim[]>();
  const canonicalAliasTargets = new Set(Object.values(input.configuration.claimAliases));
  for (const claim of input.claims) {
    const originalClaimIdentity = `${normalizedKey(claim.namespace)}.${normalizedKey(claim.key)}`;
    const aliasedIdentity = input.configuration.claimAliases[originalClaimIdentity];
    const aliasSeparator = aliasedIdentity?.indexOf('.') ?? -1;
    const namespace = aliasSeparator > 0
      ? aliasedIdentity!.slice(0, aliasSeparator)
      : normalizedKey(claim.namespace);
    const key = aliasSeparator > 0
      ? aliasedIdentity!.slice(aliasSeparator + 1)
      : normalizedKey(claim.key);
    const affectedFieldIdentity = aliasedIdentity || canonicalAliasTargets.has(originalClaimIdentity)
      ? `canonical.${namespace}.${key}`
      : normalizedKey(claim.affectedFieldPath);
    const identity = [
      claim.productId,
      claim.variantId ?? '',
      namespace,
      key,
      affectedFieldIdentity,
    ].join('|');
    const group = grouped.get(identity) ?? [];
    group.push(claim);
    grouped.set(identity, group);
  }

  const warnings: string[] = [];
  const ignoredClaimIds: string[] = [];
  const groups: TruthClaimGroup[] = [];
  for (const [identity, claims] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const candidateGroups = new Map<string, {
      claims: ProductClaim[];
      canonicalValue: string;
      displayValue: string;
      valueType: ProductClaim['valueType'];
      unit?: string;
    }>();
    for (const claim of [...claims].sort((left, right) => left.id.localeCompare(right.id))) {
      const normalized = normalizeTruthValue({
        namespace: claim.namespace,
        key: claim.key,
        value: claim.normalizedCandidateValue,
        valueType: claim.valueType,
        unit: claim.unit,
        configuration: input.configuration,
      });
      if (!normalized.usable) {
        ignoredClaimIds.push(claim.id);
        if (normalized.warning) warnings.push(normalized.warning);
        continue;
      }
      const candidateIdentity = `${normalized.valueType}|${normalized.unit ?? ''}|${normalized.canonicalValue}`;
      const existing = candidateGroups.get(candidateIdentity);
      if (existing) {
        existing.claims.push(claim);
      } else {
        candidateGroups.set(candidateIdentity, {
          claims: [claim],
          canonicalValue: normalized.canonicalValue,
          displayValue: normalized.displayValue,
          valueType: normalized.valueType,
          ...(normalized.unit ? { unit: normalized.unit } : {}),
        });
      }
    }
    const orderedClaims = [...claims].sort((left, right) => left.id.localeCompare(right.id));
    const first = orderedClaims[0];
    const identityParts = identity.split('|');
    const canonicalClaimIdentity = `${identityParts[2]}.${identityParts[3]}`;
    const representative = orderedClaims.find((claim) => (
      `${normalizedKey(claim.namespace)}.${normalizedKey(claim.key)}` === canonicalClaimIdentity
    )) ?? first;
    const groupFingerprint = input.hasher.hash({
      productId: first.productId,
      variantId: first.variantId ?? null,
      namespace: identityParts[2],
      key: identityParts[3],
      field: identityParts[4],
    });
    const candidates: TruthCandidate[] = [...candidateGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([candidateIdentity, candidate]) => {
        const claimIds = candidate.claims.map(({ id }) => id).sort();
        const evidenceIds = [...new Set(candidate.claims.flatMap(({ evidenceIds }) => evidenceIds))].sort();
        return {
          id: `truth_candidate_${input.hasher.hash({ groupFingerprint, candidateIdentity })}`,
          canonicalValue: candidate.canonicalValue,
          displayValue: candidate.displayValue,
          valueType: candidate.valueType,
          ...(candidate.unit ? { unit: candidate.unit } : {}),
          supportingClaimIds: claimIds,
          supportingEvidenceIds: evidenceIds,
          sourceDiversity: 0,
          evidenceCount: evidenceIds.length,
          sourceCount: 0,
          authoritySummary: {
            strongestLevel: 'UNKNOWN',
            strongestWeight: 0,
            authorityLevels: emptyAuthorities(),
          },
          freshnessSummary: {
            minimum: 0,
            maximum: 0,
            average: 0,
            staleEvidenceCount: 0,
          },
          confidenceContribution: 0,
          metadata: {
            candidateIdentity,
            claimOrigins: [...new Set(candidate.claims.map(({ origin }) => origin))].sort(),
          },
        };
      });
    groups.push({
      id: `truth_group_${groupFingerprint}`,
      productId: first.productId,
      ...(first.variantId ? { variantId: first.variantId } : {}),
      namespace: identityParts[2],
      key: identityParts[3],
      displayLabel: representative.displayLabel,
      affectedFieldPath: representative.affectedFieldPath,
      importance: [...claims].sort((left, right) => (
        importanceRank(right.importance) - importanceRank(left.importance)
        || left.id.localeCompare(right.id)
      ))[0].importance,
      claimIds: claims.map(({ id }) => id).sort(),
      candidates,
      evidenceIds: [...new Set(claims.flatMap(({ evidenceIds }) => evidenceIds))].sort(),
      fingerprint: groupFingerprint,
      metadata: {
        identity,
        claimCount: claims.length,
      },
    });
  }
  return immutableCopy({
    groups,
    warnings: [...new Set(warnings)].sort(),
    ignoredClaimIds: [...new Set(ignoredClaimIds)].sort(),
  }) as TruthClaimGroupingResult;
}
