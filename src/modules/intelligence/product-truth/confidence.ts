import { confidenceLevel } from '../confidence/confidence.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceFactor,
  ConfidenceResult,
  ConfidenceThresholds,
} from '../domain/types.ts';
import { validateConfidence } from '../domain/validation.ts';
import type { ProductTruthConfiguration } from './configuration.ts';
import type {
  TruthCandidate,
  TruthClaimGroup,
  TruthConfidenceMeaning,
  TruthResolutionStatus,
} from './types.ts';

export interface ProductTruthConfidenceInput {
  readonly status: TruthResolutionStatus;
  readonly group: TruthClaimGroup;
  readonly selectedCandidate?: TruthCandidate;
  readonly thresholds: ConfidenceThresholds;
  readonly configuration: ProductTruthConfiguration;
}

export interface ProductTruthConfidenceOutput {
  readonly confidence: ConfidenceResult;
  readonly meaning: TruthConfidenceMeaning;
}

function factor(
  code: string,
  label: string,
  contribution: number,
  explanation: string,
  metadata: Readonly<Record<string, unknown>> = {},
): ConfidenceFactor {
  return {
    code,
    label,
    contribution: Math.max(-1, Math.min(1, contribution)),
    explanation,
    metadata,
  };
}

export class ProductTruthConfidenceStrategy {
  readonly id = 'product-truth.explainable-confidence';
  readonly version = '1.0.0';

  calculate(input: ProductTruthConfidenceInput): ProductTruthConfidenceOutput {
    const ordered = [...input.group.candidates].sort((left, right) => (
      right.confidenceContribution - left.confidenceContribution || left.id.localeCompare(right.id)
    ));
    const top = input.selectedCandidate ?? ordered[0];
    const second = ordered.find(({ id }) => id !== top?.id);
    const candidateValue = top?.confidenceContribution ?? 0;
    const factors: ConfidenceFactor[] = [];
    let value: number;
    let meaning: TruthConfidenceMeaning;

    if (input.status === 'CONFLICTED') {
      value = Math.min(
        input.configuration.maximumConfidence,
        0.55 + Math.min(0.4, ((top?.confidenceContribution ?? 0) + (second?.confidenceContribution ?? 0)) / 4),
      );
      meaning = 'RESOLUTION_STATUS';
      factors.push(factor(
        'MATERIAL_DISAGREEMENT',
        'Material disagreement',
        0.3,
        'Multiple different candidates have meaningful independent support; confidence describes the conflict.',
      ));
    } else if (input.status === 'UNRESOLVED') {
      value = Math.min(0.8, 0.5 + Math.min(0.3, ordered.length * 0.1));
      meaning = 'RESOLUTION_STATUS';
      factors.push(factor(
        'RESPONSIBLE_NON_SELECTION',
        'Responsible non-selection',
        0.2,
        'The confidence value describes the engine decision not to select an unsupported candidate.',
      ));
    } else if (input.status === 'INSUFFICIENT_EVIDENCE') {
      value = input.group.evidenceIds.length === 0 ? 0.9 : 0.75;
      meaning = 'RESOLUTION_STATUS';
      factors.push(factor(
        'EVIDENCE_ABSENCE',
        'Evidence absence',
        0.3,
        'The confidence value describes the detected lack of usable supporting evidence.',
      ));
    } else if (input.status === 'NOT_APPLICABLE') {
      value = 0.9;
      meaning = 'RESOLUTION_STATUS';
      factors.push(factor(
        'EXPLICIT_NOT_APPLICABLE',
        'Explicit not-applicable marker',
        0.3,
        'Structured supplied metadata explicitly marks this claim as not applicable.',
      ));
    } else {
      value = candidateValue;
      meaning = 'SELECTED_CANDIDATE';
      factors.push(factor(
        'AUTHORITY_SUPPORT',
        'Authority support',
        top?.authoritySummary.strongestWeight ?? 0,
        'The strongest explainable source-authority weight contributes to candidate confidence.',
        { level: top?.authoritySummary.strongestLevel ?? 'UNKNOWN' },
      ));
      factors.push(factor(
        'INDEPENDENT_SOURCE_DIVERSITY',
        'Independent-source diversity',
        Math.min(0.3, Math.max(0, (top?.sourceDiversity ?? 0) - 1) * input.configuration.sourceDiversityWeight),
        'Only deterministically distinct source identities contribute diversity.',
        { sourceCount: top?.sourceCount ?? 0 },
      ));
      const missingProvenanceCount = Number(top?.metadata.missingProvenanceCount ?? 0);
      if (missingProvenanceCount > 0) {
        factors.push(factor(
          'MISSING_PROVENANCE_CEILING',
          'Missing provenance ceiling',
          -0.3,
          'Missing source provenance limits candidate confidence.',
          { missingProvenanceCount },
        ));
      }
      if (top?.metadata.aiOnly === true) {
        factors.push(factor(
          'AI_DERIVED_ONLY',
          'AI-derived-only evidence',
          -input.configuration.aiDerivedPenalty,
          'AI-derived evidence alone cannot verify a factual value under the default policy.',
        ));
      }
      if (top?.metadata.merchantListingOnly === true) {
        factors.push(factor(
          'MERCHANT_LISTING_ONLY',
          'Merchant-listing-only evidence',
          -0.2,
          'The current merchant listing alone cannot verify its own factual value.',
        ));
      }
      if (input.status === 'MERCHANT_OVERRIDE') {
        factors.push(factor(
          'MERCHANT_APPROVED_OVERRIDE',
          'Merchant-approved override',
          0.25,
          'An explicit merchant-approved override selected the candidate and remains visibly marked.',
        ));
        value = Math.max(value, input.configuration.likelyThreshold);
      }
      if (second && second.confidenceContribution >= input.configuration.conflictThreshold) {
        factors.push(factor(
          'DISAGREEMENT',
          'Competing candidate support',
          -second.confidenceContribution,
          'A materially supported competing candidate reduces selection confidence.',
          { competingCandidateId: second.id },
        ));
      }
    }

    value = Math.max(0, Math.min(input.configuration.maximumConfidence, value));
    const confidence: ConfidenceResult = {
      value,
      level: confidenceLevel(value, input.thresholds),
      strategyVersion: this.version,
      factors,
    };
    validateConfidence(confidence);
    return immutableCopy({ confidence, meaning }) as ProductTruthConfidenceOutput;
  }
}
