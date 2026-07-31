import { confidenceLevel } from '../confidence/confidence.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceFactor,
  ConfidenceResult,
  ConfidenceThresholds,
} from '../domain/types.ts';
import { validateConfidence } from '../domain/validation.ts';
import type { TruthFinding } from '../product-truth/types.ts';
import { AI_DETECTIVE_VERSION } from './configuration.ts';
import type { ContradictionType } from './types.ts';

export interface AIDetectiveConfidenceInput {
  readonly type: ContradictionType;
  readonly truthFindings: readonly TruthFinding[];
  readonly contradictionCertainty: number;
  readonly evidenceQuality: number;
  readonly thresholds: ConfidenceThresholds;
}

function bounded(value: number): number {
  return Math.max(0, Math.min(0.98, value));
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

export class AIDetectiveConfidenceStrategy {
  readonly id = 'ai-detective.deterministic-confidence';
  readonly version = AI_DETECTIVE_VERSION;

  calculate(input: AIDetectiveConfidenceInput): ConfidenceResult {
    const truthSupport = input.truthFindings.length
      ? input.truthFindings.reduce((sum, finding) => sum + finding.confidence.value, 0)
        / input.truthFindings.length
      : input.contradictionCertainty;
    const value = bounded(
      input.contradictionCertainty * 0.5
      + truthSupport * 0.3
      + input.evidenceQuality * 0.2,
    );
    const result: ConfidenceResult = {
      value,
      level: confidenceLevel(value, input.thresholds),
      strategyVersion: this.version,
      factors: [
        factor(
          'CONTRADICTION_CERTAINTY',
          'Contradiction certainty',
          input.contradictionCertainty,
          'Deterministic comparison certainty contributes directly to confidence that the contradiction exists.',
          { contradictionType: input.type },
        ),
        factor(
          'PRODUCT_TRUTH_STRENGTH',
          'Product Truth strength',
          truthSupport,
          input.truthFindings.length
            ? 'The confidence of involved Product Truth findings supports the contradiction assessment.'
            : 'No Product Truth finding was required; deterministic normalized fields provide the comparison.',
          { findingCount: input.truthFindings.length },
        ),
        factor(
          'EVIDENCE_QUALITY',
          'Evidence quality',
          input.evidenceQuality,
          'Available evidence and provenance quality support the contradiction explanation.',
        ),
      ],
    };
    validateConfidence(result);
    return immutableCopy(result) as ConfidenceResult;
  }
}
