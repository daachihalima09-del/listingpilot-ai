import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceFactor,
  ConfidenceLevel,
  ConfidenceResult,
  ConfidenceThresholds,
  Evidence,
} from '../domain/types.ts';
import { validateConfidence } from '../domain/validation.ts';

export interface ConfidenceCalculationInput {
  readonly evidence: readonly Evidence[];
  readonly evidenceWeights?: Readonly<Record<string, number>>;
  readonly detectorWeight?: number;
  readonly ruleWeight?: number;
  readonly officialSourceWeight?: number;
  readonly merchantOverride?: number;
  readonly freshnessFactor?: number;
  readonly disagreementPenalty?: number;
  readonly thresholds: ConfidenceThresholds;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ConfidenceStrategy {
  readonly id: string;
  readonly version: string;
  calculate(input: ConfidenceCalculationInput): ConfidenceResult;
}

export function confidenceLevel(value: number, thresholds: ConfidenceThresholds): ConfidenceLevel {
  if (value <= thresholds.veryLowMaximum) return 'VERY_LOW';
  if (value <= thresholds.lowMaximum) return 'LOW';
  if (value <= thresholds.mediumMaximum) return 'MEDIUM';
  if (value <= thresholds.highMaximum) return 'HIGH';
  return 'VERY_HIGH';
}

function informationalFactor(
  code: string,
  label: string,
  contribution: number | undefined,
): ConfidenceFactor | null {
  if (contribution === undefined) return null;
  return {
    code,
    label,
    contribution: Math.max(-1, Math.min(1, contribution)),
    explanation: `${label} was supplied for traceability; the neutral strategy does not combine production weights.`,
    metadata: {},
  };
}

export class NeutralConfidenceStrategy implements ConfidenceStrategy {
  readonly id = 'neutral';
  readonly version: string;

  constructor(version = '1.0.0') {
    this.version = version;
  }

  calculate(input: ConfidenceCalculationInput): ConfidenceResult {
    const value = input.merchantOverride ?? 0.5;
    const factors = [
      informationalFactor('DETECTOR_WEIGHT', 'Detector weight', input.detectorWeight),
      informationalFactor('RULE_WEIGHT', 'Rule weight', input.ruleWeight),
      informationalFactor('OFFICIAL_SOURCE_WEIGHT', 'Official-source weight', input.officialSourceWeight),
      informationalFactor('FRESHNESS', 'Freshness factor', input.freshnessFactor),
      informationalFactor('DISAGREEMENT', 'Disagreement penalty', input.disagreementPenalty),
      ...(input.merchantOverride === undefined ? [] : [{
        code: 'MERCHANT_OVERRIDE',
        label: 'Merchant override',
        contribution: input.merchantOverride,
        explanation: 'A validated merchant override supplied the neutral confidence value.',
        metadata: {},
      } satisfies ConfidenceFactor]),
    ].filter((factor): factor is ConfidenceFactor => factor !== null);
    const result: ConfidenceResult = {
      value,
      level: confidenceLevel(value, input.thresholds),
      strategyVersion: this.version,
      factors,
    };
    validateConfidence(result);
    return immutableCopy(result) as ConfidenceResult;
  }
}
