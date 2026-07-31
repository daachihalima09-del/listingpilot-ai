import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { IssueSeverity } from '../domain/types.ts';
import type {
  ContradictionType,
} from './types.ts';
import type { TruthResolutionStatus } from '../product-truth/types.ts';

export const AI_DETECTIVE_CAPABILITY_ID = 'ai-detective';
export const AI_DETECTIVE_VERSION = '1.0.0';

export interface AIDetectiveConfiguration {
  readonly enabledContradictionTypes: readonly ContradictionType[];
  readonly minimumSeverity: IssueSeverity;
  readonly severityOverrides: Partial<Readonly<Record<ContradictionType, IssueSeverity>>>;
  readonly confidenceThresholds: Readonly<Record<ContradictionType, number>>;
  readonly blockingContradictionTypes: readonly ContradictionType[];
  readonly truthListingStatuses: readonly TruthResolutionStatus[];
  readonly duplicateIdentityFields: readonly ('sku' | 'barcode')[];
}

export interface AIDetectiveConfigurationInput {
  readonly enabledContradictionTypes?: readonly ContradictionType[];
  readonly minimumSeverity?: IssueSeverity;
  readonly severityOverrides?: Partial<Readonly<Record<ContradictionType, IssueSeverity>>>;
  readonly confidenceThresholds?: Partial<Readonly<Record<ContradictionType, number>>>;
  readonly blockingContradictionTypes?: readonly ContradictionType[];
  readonly truthListingStatuses?: readonly TruthResolutionStatus[];
  readonly duplicateIdentityFields?: readonly ('sku' | 'barcode')[];
}

export const CONTRADICTION_TYPES: readonly ContradictionType[] = Object.freeze([
  'VALUE_CONFLICT',
  'DUPLICATE_IDENTITY',
  'IMPOSSIBLE_COMBINATION',
  'SUSPICIOUS_COMBINATION',
  'WEAK_EVIDENCE',
  'TRUTH_LISTING_MISMATCH',
]);

const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const truthStatuses: readonly TruthResolutionStatus[] = [
  'VERIFIED',
  'LIKELY',
  'CONFLICTED',
  'UNRESOLVED',
  'INSUFFICIENT_EVIDENCE',
  'MERCHANT_OVERRIDE',
  'NOT_APPLICABLE',
];

const defaults: AIDetectiveConfiguration = {
  enabledContradictionTypes: CONTRADICTION_TYPES,
  minimumSeverity: 'LOW',
  severityOverrides: {},
  confidenceThresholds: {
    VALUE_CONFLICT: 0.6,
    DUPLICATE_IDENTITY: 0.8,
    IMPOSSIBLE_COMBINATION: 0.8,
    SUSPICIOUS_COMBINATION: 0.55,
    WEAK_EVIDENCE: 0.6,
    TRUTH_LISTING_MISMATCH: 0.7,
  },
  blockingContradictionTypes: ['IMPOSSIBLE_COMBINATION'],
  truthListingStatuses: ['VERIFIED'],
  duplicateIdentityFields: ['sku', 'barcode'],
};

function uniqueTypes(
  values: readonly ContradictionType[],
  field: string,
): readonly ContradictionType[] {
  if (values.some((value) => !CONTRADICTION_TYPES.includes(value))) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} contains an unsupported contradiction type.`);
  }
  return [...new Set(values)].sort();
}

export function createAIDetectiveConfiguration(
  input: AIDetectiveConfigurationInput = {},
): AIDetectiveConfiguration {
  for (const key of Object.keys(input.confidenceThresholds ?? {})) {
    if (!CONTRADICTION_TYPES.includes(key as ContradictionType)) {
      throw new IntelligenceDomainError(
        'INVALID_CONFIDENCE',
        `AI Detective confidence threshold type ${key} is unsupported.`,
      );
    }
  }
  for (const key of Object.keys(input.severityOverrides ?? {})) {
    if (!CONTRADICTION_TYPES.includes(key as ContradictionType)) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        `AI Detective severity override type ${key} is unsupported.`,
      );
    }
  }
  const confidenceThresholds = Object.fromEntries(CONTRADICTION_TYPES.map((type) => [
    type,
    input.confidenceThresholds?.[type] ?? defaults.confidenceThresholds[type],
  ])) as Record<ContradictionType, number>;
  for (const [type, threshold] of Object.entries(confidenceThresholds)) {
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new IntelligenceDomainError(
        'INVALID_CONFIDENCE',
        `AI Detective confidence threshold for ${type} must be between zero and one.`,
      );
    }
  }
  const minimumSeverity = input.minimumSeverity ?? defaults.minimumSeverity;
  if (!severities.includes(minimumSeverity)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'AI Detective minimum severity is invalid.');
  }
  for (const severity of Object.values(input.severityOverrides ?? {})) {
    if (!severities.includes(severity as IssueSeverity)) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', 'AI Detective severity override is invalid.');
    }
  }
  const configuredTruthStatuses = input.truthListingStatuses ?? defaults.truthListingStatuses;
  if (configuredTruthStatuses.some((status) => !truthStatuses.includes(status))) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Truth-listing status policy is invalid.');
  }
  const duplicateIdentityFields = input.duplicateIdentityFields ?? defaults.duplicateIdentityFields;
  if (duplicateIdentityFields.some((field) => field !== 'sku' && field !== 'barcode')) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Duplicate-identity field policy is invalid.');
  }
  return immutableCopy({
    enabledContradictionTypes: uniqueTypes(
      input.enabledContradictionTypes ?? defaults.enabledContradictionTypes,
      'enabledContradictionTypes',
    ),
    minimumSeverity,
    severityOverrides: { ...defaults.severityOverrides, ...input.severityOverrides },
    confidenceThresholds,
    blockingContradictionTypes: uniqueTypes(
      input.blockingContradictionTypes ?? defaults.blockingContradictionTypes,
      'blockingContradictionTypes',
    ),
    truthListingStatuses: [...new Set(configuredTruthStatuses)].sort(),
    duplicateIdentityFields: [...new Set(duplicateIdentityFields)].sort(),
  }) as AIDetectiveConfiguration;
}
