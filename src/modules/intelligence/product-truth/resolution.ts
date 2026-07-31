import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { IntelligenceContext } from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import { PRODUCT_TRUTH_VERSION } from './configuration.ts';
import { ProductTruthConfidenceStrategy } from './confidence.ts';
import type { TruthValueComparisonStrategy } from './normalization.ts';
import type {
  ProductClaim,
  TruthCandidate,
  TruthClaimGroup,
  TruthResolution,
  TruthResolutionStatus,
  TruthReviewRequirement,
} from './types.ts';

export interface TruthResolutionDecision {
  readonly status: TruthResolutionStatus;
  readonly selectedCandidate?: TruthCandidate;
  readonly explanation: string;
  readonly contributingFactors: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
  readonly conflictingEvidenceIds: readonly string[];
  readonly reviewRequirement: TruthReviewRequirement;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ProductTruthResolutionInput {
  readonly group: TruthClaimGroup;
  readonly claimsById: ReadonlyMap<string, ProductClaim>;
  readonly configuration: ProductTruthConfiguration;
  readonly comparisonStrategy: TruthValueComparisonStrategy;
}

export interface ProductTruthResolutionStrategy {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly supportedClaimTypes: readonly string[];
  readonly deterministic: boolean;
  readonly requiredMetadata: readonly string[];
  readonly enabled: boolean;
  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null;
}

interface StrategyRegistration {
  readonly strategy: ProductTruthResolutionStrategy;
  enabled: boolean;
}

export class ProductTruthResolutionStrategyRegistry {
  private readonly entries = new Map<string, StrategyRegistration>();

  register(strategy: ProductTruthResolutionStrategy): void {
    if (!strategy.id.trim() || !strategy.version.trim() || !Number.isFinite(strategy.priority)
      || strategy.priority < 0 || !strategy.deterministic) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Product Truth resolution strategy is malformed.');
    }
    if (this.entries.has(strategy.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Resolution strategy ID is already registered.', {
        id: strategy.id,
      });
    }
    this.entries.set(strategy.id, { strategy, enabled: strategy.enabled });
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  ordered(): readonly ProductTruthResolutionStrategy[] {
    return [...this.entries.values()]
      .filter(({ enabled }) => enabled)
      .map(({ strategy }) => strategy)
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  snapshot(): readonly Readonly<{ id: string; version: string; priority: number; enabled: boolean }>[] {
    return immutableCopy([...this.entries.values()]
      .sort((left, right) => left.strategy.id.localeCompare(right.strategy.id))
      .map(({ strategy, enabled }) => ({
        id: strategy.id,
        version: strategy.version,
        priority: strategy.priority,
        enabled,
      })));
  }

  private require(id: string): StrategyRegistration {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Resolution strategy is not registered.', { id });
    }
    return entry;
  }
}

abstract class BaseResolutionStrategy implements ProductTruthResolutionStrategy {
  abstract readonly id: string;
  readonly version = PRODUCT_TRUTH_VERSION;
  abstract readonly priority: number;
  readonly supportedClaimTypes: readonly string[] = ['*'];
  readonly deterministic = true;
  readonly requiredMetadata: readonly string[] = [];
  readonly enabled = true;
  abstract resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null;
}

function orderedCandidates(group: TruthClaimGroup): TruthCandidate[] {
  return [...group.candidates].sort((left, right) => (
    right.confidenceContribution - left.confidenceContribution || left.id.localeCompare(right.id)
  ));
}

function compareCandidates(
  left: TruthCandidate,
  right: TruthCandidate,
  strategy: TruthValueComparisonStrategy,
) {
  return strategy.compare(
    {
      usable: true,
      canonicalValue: left.canonicalValue,
      displayValue: left.displayValue,
      valueType: left.valueType,
      ...(left.unit ? { unit: left.unit } : {}),
    },
    {
      usable: true,
      canonicalValue: right.canonicalValue,
      displayValue: right.displayValue,
      valueType: right.valueType,
      ...(right.unit ? { unit: right.unit } : {}),
    },
  );
}

function blockingReview(
  group: TruthClaimGroup,
  configuration: ProductTruthConfiguration,
): TruthReviewRequirement {
  return configuration.blockingImportances.includes(group.importance) ? 'BLOCKING' : 'REQUIRED';
}

export class NotApplicableTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.not-applicable';
  readonly priority = 10;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    const claims = input.group.claimIds
      .map((id) => input.claimsById.get(id))
      .filter((claim): claim is ProductClaim => Boolean(claim));
    if (!claims.some(({ metadata }) => metadata.notApplicable === true)) return null;
    return {
      status: 'NOT_APPLICABLE',
      explanation: 'Structured claim metadata explicitly marks this fact as not applicable.',
      contributingFactors: ['EXPLICIT_NOT_APPLICABLE'],
      supportingEvidenceIds: input.group.evidenceIds,
      conflictingEvidenceIds: [],
      reviewRequirement: 'NONE',
      metadata: {},
    };
  }
}

export class MerchantOverrideTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.merchant-override';
  readonly priority = 20;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    if (!input.configuration.merchantOverridesEnabled) return null;
    const claimById = input.claimsById;
    const overrides = input.group.candidates.filter((candidate) => (
      candidate.metadata.merchantOverride === true
      || candidate.supportingClaimIds.some((id) => claimById.get(id)?.metadata.merchantApprovedOverride === true)
    ));
    if (overrides.length === 0) return null;
    if (overrides.length > 1) {
      return {
        status: 'CONFLICTED',
        explanation: 'Multiple merchant-approved overrides select materially different values.',
        contributingFactors: ['MULTIPLE_MERCHANT_OVERRIDES'],
        supportingEvidenceIds: [],
        conflictingEvidenceIds: [...new Set(overrides.flatMap(({ supportingEvidenceIds }) => supportingEvidenceIds))].sort(),
        reviewRequirement: blockingReview(input.group, input.configuration),
        metadata: { overrideConflict: true },
      };
    }
    const selected = overrides[0];
    const conflicting = input.group.candidates
      .filter(({ id, confidenceContribution }) => (
        id !== selected.id && confidenceContribution >= input.configuration.conflictThreshold
      ));
    return {
      status: 'MERCHANT_OVERRIDE',
      selectedCandidate: selected,
      explanation: conflicting.length
        ? 'An explicit merchant-approved value is selected, but materially supported conflicting evidence remains.'
        : 'An explicit merchant-approved value is selected and remains traceable as an override.',
      contributingFactors: ['MERCHANT_APPROVED_OVERRIDE', ...(conflicting.length ? ['MATERIAL_CONFLICT_RETAINED'] : [])],
      supportingEvidenceIds: selected.supportingEvidenceIds,
      conflictingEvidenceIds: [...new Set(conflicting.flatMap(({ supportingEvidenceIds }) => supportingEvidenceIds))].sort(),
      reviewRequirement: conflicting.length ? blockingReview(input.group, input.configuration) : 'OPTIONAL',
      metadata: { overrideConflict: conflicting.length > 0 },
    };
  }
}

export class InsufficientEvidenceTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.insufficient-evidence';
  readonly priority = 30;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    const evidenceCount = input.group.candidates.reduce((sum, candidate) => sum + candidate.evidenceCount, 0);
    const requiredTypes = input.configuration.requiredEvidenceTypes[
      `${input.group.namespace}.${input.group.key}`
    ] ?? [];
    const availableTypes = new Set(input.group.candidates.flatMap((candidate) => (
      Array.isArray(candidate.metadata.evidenceTypes)
        ? candidate.metadata.evidenceTypes.filter((value): value is string => typeof value === 'string')
        : []
    )));
    const missingRequiredTypes = requiredTypes.filter((type) => !availableTypes.has(type));
    if (evidenceCount >= input.configuration.minimumUsableEvidence && missingRequiredTypes.length === 0) return null;
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      explanation: input.group.candidates.length
        ? 'Candidate values exist, but no adequate traceable evidence supports them.'
        : 'No usable candidate value or adequate evidence is available.',
      contributingFactors: ['MINIMUM_EVIDENCE_NOT_MET'],
      supportingEvidenceIds: [],
      conflictingEvidenceIds: [],
      reviewRequirement: input.configuration.blockingImportances.includes(input.group.importance)
        ? 'BLOCKING'
        : 'OPTIONAL',
      metadata: { evidenceCount, missingRequiredEvidenceTypes: missingRequiredTypes },
    };
  }
}

export class ExactConsensusTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.exact-consensus';
  readonly priority = 40;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    if (input.group.candidates.length !== 1) return null;
    const selected = input.group.candidates[0];
    const mayVerify = selected.confidenceContribution >= input.configuration.verifiedThreshold
      && selected.evidenceCount >= input.configuration.minimumVerifiedEvidence
      && selected.sourceCount >= Math.min(2, input.configuration.minimumVerifiedEvidence)
      && selected.metadata.aiOnly !== true
      && selected.metadata.merchantListingOnly !== true
      && Number(selected.metadata.missingProvenanceCount ?? 0) === 0;
    if (mayVerify) {
      return {
        status: 'VERIFIED',
        selectedCandidate: selected,
        explanation: 'Strong, traceable, independently sourced evidence agrees on one canonical candidate.',
        contributingFactors: ['EXACT_CONSENSUS', 'VERIFIED_THRESHOLD_MET', 'NO_MATERIAL_CONFLICT'],
        supportingEvidenceIds: selected.supportingEvidenceIds,
        conflictingEvidenceIds: [],
        reviewRequirement: 'NONE',
        metadata: {},
      };
    }
    if (selected.confidenceContribution >= input.configuration.likelyThreshold
      && selected.evidenceCount >= input.configuration.minimumLikelyEvidence) {
      return {
        status: 'LIKELY',
        selectedCandidate: selected,
        explanation: 'Usable evidence agrees on one candidate, but verified evidence requirements are not met.',
        contributingFactors: ['EXACT_CONSENSUS', 'LIKELY_THRESHOLD_MET'],
        supportingEvidenceIds: selected.supportingEvidenceIds,
        conflictingEvidenceIds: [],
        reviewRequirement: 'OPTIONAL',
        metadata: {},
      };
    }
    return null;
  }
}

export class MaterialConflictTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.material-conflict';
  readonly priority = 50;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    const supported = orderedCandidates(input.group)
      .filter(({ confidenceContribution }) => confidenceContribution >= input.configuration.conflictThreshold);
    if (supported.length < 2) return null;
    const comparisons = supported.slice(1).map((candidate) => (
      compareCandidates(supported[0], candidate, input.comparisonStrategy)
    ));
    if (comparisons.some(({ result }) => result === 'INCOMPARABLE')) return null;
    if (!comparisons.some(({ result }) => result === 'CONFLICTING')) return null;
    const difference = supported[0].confidenceContribution - supported[1].confidenceContribution;
    if (difference >= input.configuration.authorityDominanceMargin) return null;
    return {
      status: 'CONFLICTED',
      explanation: 'Multiple materially different candidates have comparable, meaningful evidence support.',
      contributingFactors: ['MATERIAL_CANDIDATE_SUPPORT', 'INSUFFICIENT_AUTHORITY_DOMINANCE'],
      supportingEvidenceIds: [],
      conflictingEvidenceIds: [...new Set(supported.flatMap(({ supportingEvidenceIds }) => supportingEvidenceIds))].sort(),
      reviewRequirement: blockingReview(input.group, input.configuration),
      metadata: { materiallySupportedCandidateCount: supported.length },
    };
  }
}

export class AuthorityWeightedConsensusTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.authority-weighted-consensus';
  readonly priority = 60;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision | null {
    if (input.group.candidates.length < 2) return null;
    const ordered = orderedCandidates(input.group);
    const selected = ordered[0];
    const second = ordered[1];
    if (compareCandidates(selected, second, input.comparisonStrategy).result !== 'CONFLICTING') return null;
    const difference = selected.confidenceContribution - second.confidenceContribution;
    if (selected.confidenceContribution < input.configuration.likelyThreshold
      || difference < input.configuration.authorityDominanceMargin) return null;
    const hasMaterialConflict = second.confidenceContribution >= input.configuration.conflictThreshold;
    const mayVerify = !hasMaterialConflict
      && selected.confidenceContribution >= input.configuration.verifiedThreshold
      && selected.evidenceCount >= input.configuration.minimumVerifiedEvidence
      && selected.sourceCount >= Math.min(2, input.configuration.minimumVerifiedEvidence)
      && selected.metadata.aiOnly !== true
      && selected.metadata.merchantListingOnly !== true
      && Number(selected.metadata.missingProvenanceCount ?? 0) === 0;
    return {
      status: mayVerify ? 'VERIFIED' : 'LIKELY',
      selectedCandidate: selected,
      explanation: mayVerify
        ? 'One candidate has strong authoritative support and competing evidence is not materially supported.'
        : 'One candidate has meaningfully stronger authority-weighted support, but the conclusion remains likely.',
      contributingFactors: [
        'AUTHORITY_WEIGHTED_SUPPORT',
        'MEANINGFUL_SUPPORT_MARGIN',
        ...(hasMaterialConflict ? ['CONFLICT_RETAINED_BELOW_DOMINANCE_POLICY'] : []),
      ],
      supportingEvidenceIds: selected.supportingEvidenceIds,
      conflictingEvidenceIds: second.supportingEvidenceIds,
      reviewRequirement: mayVerify ? 'NONE' : hasMaterialConflict ? 'REQUIRED' : 'OPTIONAL',
      metadata: { supportMargin: difference },
    };
  }
}

export class UnresolvedTruthStrategy extends BaseResolutionStrategy {
  readonly id = 'product-truth.unresolved-fallback';
  readonly priority = 1_000;

  resolve(input: ProductTruthResolutionInput): TruthResolutionDecision {
    return {
      status: 'UNRESOLVED',
      explanation: 'Evidence exists, but no deterministic strategy can responsibly select a candidate.',
      contributingFactors: ['NO_SAFE_RESOLUTION_STRATEGY'],
      supportingEvidenceIds: [],
      conflictingEvidenceIds: input.group.evidenceIds,
      reviewRequirement: blockingReview(input.group, input.configuration),
      metadata: {},
    };
  }
}

export function createDefaultProductTruthResolutionStrategyRegistry(): ProductTruthResolutionStrategyRegistry {
  const registry = new ProductTruthResolutionStrategyRegistry();
  registry.register(new NotApplicableTruthStrategy());
  registry.register(new MerchantOverrideTruthStrategy());
  registry.register(new InsufficientEvidenceTruthStrategy());
  registry.register(new ExactConsensusTruthStrategy());
  registry.register(new MaterialConflictTruthStrategy());
  registry.register(new AuthorityWeightedConsensusTruthStrategy());
  registry.register(new UnresolvedTruthStrategy());
  return registry;
}

export function resolveProductTruthGroups(input: {
  readonly groups: readonly TruthClaimGroup[];
  readonly claims: readonly ProductClaim[];
  readonly configuration: ProductTruthConfiguration;
  readonly strategies: ProductTruthResolutionStrategyRegistry;
  readonly confidenceStrategy: ProductTruthConfidenceStrategy;
  readonly comparisonStrategy: TruthValueComparisonStrategy;
  readonly context: IntelligenceContext;
  readonly hasher: IntelligenceHasher;
  readonly capabilityVersion?: string;
}): readonly TruthResolution[] {
  const claimsById = new Map(input.claims.map((claim) => [claim.id, claim]));
  return immutableCopy(input.groups.map((group) => {
    let selectedStrategy: ProductTruthResolutionStrategy | undefined;
    let decision: TruthResolutionDecision | null = null;
    for (const strategy of input.strategies.ordered()) {
      decision = strategy.resolve({
        group,
        claimsById,
        configuration: input.configuration,
        comparisonStrategy: input.comparisonStrategy,
      });
      if (decision) {
        selectedStrategy = strategy;
        break;
      }
    }
    if (!decision || !selectedStrategy) {
      throw new IntelligenceDomainError(
        'DETECTOR_EXECUTION_FAILED',
        'Product Truth resolution registry has no applicable fallback strategy.',
      );
    }
    const confidence = input.confidenceStrategy.calculate({
      status: decision.status,
      group,
      selectedCandidate: decision.selectedCandidate,
      thresholds: input.context.confidenceThresholds,
      configuration: input.configuration,
    });
    return {
      id: `truth_resolution_${input.hasher.hash({
        groupId: group.id,
        status: decision.status,
        candidateId: decision.selectedCandidate?.id ?? null,
        strategyId: selectedStrategy.id,
      })}`,
      claimGroupId: group.id,
      productId: group.productId,
      ...(group.variantId ? { variantId: group.variantId } : {}),
      status: decision.status,
      ...(decision.selectedCandidate ? {
        selectedCandidateId: decision.selectedCandidate.id,
        selectedValue: decision.selectedCandidate.displayValue,
      } : {}),
      confidence: confidence.confidence,
      confidenceMeaning: confidence.meaning,
      explanation: decision.explanation,
      contributingFactors: decision.contributingFactors,
      supportingEvidenceIds: [...new Set(decision.supportingEvidenceIds)].sort(),
      conflictingEvidenceIds: [...new Set(decision.conflictingEvidenceIds)].sort(),
      reviewRequirement: decision.reviewRequirement,
      strategyId: selectedStrategy.id,
      strategyVersion: selectedStrategy.version,
      knowledgePackVersions: [],
      capabilityVersion: input.capabilityVersion ?? PRODUCT_TRUTH_VERSION,
      createdAt: input.context.execution.requestedAt,
      metadata: {
        ...decision.metadata,
        compatibleKnowledgePackIds: [...input.context.knowledgePackIds].sort(),
      },
    } satisfies TruthResolution;
  })) as readonly TruthResolution[];
}
