import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { EvidenceReliability, EvidenceType } from '../domain/types.ts';
import type {
  ClaimImportance,
  EvidenceAuthorityLevel,
} from './types.ts';

export const PRODUCT_TRUTH_VERSION = '1.0.0';
export const PRODUCT_TRUTH_CAPABILITY_ID = 'product-truth';

export type UnicodeNormalizationMode = 'NFC' | 'NFKC';
export type DuplicateSourceTreatment = 'STRONGEST_ONLY' | 'DIMINISHING';

export interface ProductTruthConfiguration {
  readonly stringNormalization: {
    readonly trim: boolean;
    readonly collapseWhitespace: boolean;
    readonly caseSensitive: boolean;
    readonly unicodeMode: UnicodeNormalizationMode;
  };
  readonly booleanAliases: {
    readonly trueValues: readonly string[];
    readonly falseValues: readonly string[];
  };
  readonly unitAliases: Readonly<Record<string, string>>;
  readonly valueAliases: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly claimAliases: Readonly<Record<string, string>>;
  readonly requiredEvidenceTypes: Readonly<Record<string, readonly EvidenceType[]>>;
  readonly unorderedListClaims: readonly string[];
  readonly authorityWeights: Readonly<Record<EvidenceAuthorityLevel, number>>;
  readonly reliabilityWeights: Readonly<Record<EvidenceReliability, number>>;
  readonly freshness: {
    readonly enabled: boolean;
    readonly weight: number;
    readonly staleThreshold: number;
  };
  readonly sourceDiversityWeight: number;
  readonly duplicateSourceTreatment: DuplicateSourceTreatment;
  readonly aiDerivedPenalty: number;
  readonly minimumUsableEvidence: number;
  readonly minimumVerifiedEvidence: number;
  readonly minimumLikelyEvidence: number;
  readonly verifiedThreshold: number;
  readonly likelyThreshold: number;
  readonly conflictThreshold: number;
  readonly authorityDominanceMargin: number;
  readonly missingProvenanceConfidenceCeiling: number;
  readonly aiOnlyConfidenceCeiling: number;
  readonly merchantListingOnlyConfidenceCeiling: number;
  readonly maximumConfidence: number;
  readonly merchantOverridesEnabled: boolean;
  readonly claimImportanceDefaults: Readonly<Record<string, ClaimImportance>>;
  readonly defaultImportance: ClaimImportance;
  readonly blockingImportances: readonly ClaimImportance[];
  readonly insufficientEvidenceIssueMinimumImportance: ClaimImportance;
  readonly lowConfidenceIssueThreshold: number;
}

export interface ProductTruthConfigurationInput {
  readonly stringNormalization?: Partial<ProductTruthConfiguration['stringNormalization']>;
  readonly booleanAliases?: Partial<ProductTruthConfiguration['booleanAliases']>;
  readonly unitAliases?: Readonly<Record<string, string>>;
  readonly valueAliases?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly claimAliases?: Readonly<Record<string, string>>;
  readonly requiredEvidenceTypes?: Readonly<Record<string, readonly EvidenceType[]>>;
  readonly unorderedListClaims?: readonly string[];
  readonly authorityWeights?: Partial<Record<EvidenceAuthorityLevel, number>>;
  readonly reliabilityWeights?: Partial<Record<EvidenceReliability, number>>;
  readonly freshness?: Partial<ProductTruthConfiguration['freshness']>;
  readonly sourceDiversityWeight?: number;
  readonly duplicateSourceTreatment?: DuplicateSourceTreatment;
  readonly aiDerivedPenalty?: number;
  readonly minimumUsableEvidence?: number;
  readonly minimumVerifiedEvidence?: number;
  readonly minimumLikelyEvidence?: number;
  readonly verifiedThreshold?: number;
  readonly likelyThreshold?: number;
  readonly conflictThreshold?: number;
  readonly authorityDominanceMargin?: number;
  readonly missingProvenanceConfidenceCeiling?: number;
  readonly aiOnlyConfidenceCeiling?: number;
  readonly merchantListingOnlyConfidenceCeiling?: number;
  readonly maximumConfidence?: number;
  readonly merchantOverridesEnabled?: boolean;
  readonly claimImportanceDefaults?: Readonly<Record<string, ClaimImportance>>;
  readonly defaultImportance?: ClaimImportance;
  readonly blockingImportances?: readonly ClaimImportance[];
  readonly insufficientEvidenceIssueMinimumImportance?: ClaimImportance;
  readonly lowConfidenceIssueThreshold?: number;
}

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
const reliabilityLevels: readonly EvidenceReliability[] = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'OFFICIAL'];
const importanceValues: readonly ClaimImportance[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];

const defaults: ProductTruthConfiguration = {
  stringNormalization: {
    trim: true,
    collapseWhitespace: true,
    caseSensitive: false,
    unicodeMode: 'NFKC',
  },
  booleanAliases: {
    trueValues: ['true', 'yes', '1'],
    falseValues: ['false', 'no', '0'],
  },
  unitAliases: {},
  valueAliases: {},
  claimAliases: {},
  requiredEvidenceTypes: {},
  unorderedListClaims: [],
  authorityWeights: {
    MERCHANT_OVERRIDE: 1,
    MANUFACTURER_STRUCTURED: 0.95,
    MANUFACTURER_DOCUMENT: 0.9,
    AUTHORITATIVE_DISTRIBUTOR: 0.82,
    RETAILER_STRUCTURED: 0.72,
    MERCHANT_LISTING: 0.58,
    HUMAN_REVIEWED: 0.7,
    AI_DERIVED: 0.35,
    UNKNOWN: 0.2,
  },
  reliabilityWeights: {
    UNKNOWN: 0.2,
    LOW: 0.35,
    MEDIUM: 0.6,
    HIGH: 0.82,
    OFFICIAL: 1,
  },
  freshness: {
    enabled: true,
    weight: 0.1,
    staleThreshold: 0.35,
  },
  sourceDiversityWeight: 0.08,
  duplicateSourceTreatment: 'STRONGEST_ONLY',
  aiDerivedPenalty: 0.25,
  minimumUsableEvidence: 1,
  minimumVerifiedEvidence: 2,
  minimumLikelyEvidence: 1,
  verifiedThreshold: 0.82,
  likelyThreshold: 0.58,
  conflictThreshold: 0.48,
  authorityDominanceMargin: 0.2,
  missingProvenanceConfidenceCeiling: 0.55,
  aiOnlyConfidenceCeiling: 0.55,
  merchantListingOnlyConfidenceCeiling: 0.59,
  maximumConfidence: 0.98,
  merchantOverridesEnabled: true,
  claimImportanceDefaults: {
    'product.title': 'HIGH',
    'product.vendor': 'HIGH',
    'product.productType': 'MEDIUM',
    'variant.price': 'CRITICAL',
    'variant.sku': 'HIGH',
    'variant.barcode': 'HIGH',
  },
  defaultImportance: 'MEDIUM',
  blockingImportances: ['CRITICAL'],
  insufficientEvidenceIssueMinimumImportance: 'HIGH',
  lowConfidenceIssueThreshold: 0.82,
};

function assertUnitInterval(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must be between zero and one.`, { field });
  }
}

function assertCount(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must be a non-negative integer.`, { field });
  }
}

function assertImportance(value: string, field: string): asserts value is ClaimImportance {
  if (!importanceValues.includes(value as ClaimImportance)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} has an unsupported importance.`, { field });
  }
}

function normalizedStringList(values: readonly string[], field: string): readonly string[] {
  const result = [...new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))].sort();
  if (result.length === 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must contain at least one value.`, { field });
  }
  return result;
}

export function createProductTruthConfiguration(
  input: ProductTruthConfigurationInput = {},
): ProductTruthConfiguration {
  for (const [key, value] of Object.entries(input.unitAliases ?? {})) {
    if (!key.trim() || !value.trim()) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', 'Unit aliases require non-empty keys and values.');
    }
  }
  for (const [claim, aliases] of Object.entries(input.valueAliases ?? {})) {
    if (!claim.trim() || Object.entries(aliases).some(([key, value]) => !key.trim() || !value.trim())) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', 'Value aliases require non-empty claim, alias, and value.');
    }
  }
  for (const [key, value] of Object.entries(input.claimAliases ?? {})) {
    if (!key.trim() || !value.trim() || !value.includes('.')) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        'Claim aliases require a non-empty namespace.key canonical identity.',
      );
    }
  }
  const evidenceTypes: readonly EvidenceType[] = [
    'SOURCE_VALUE',
    'DOCUMENT_CLAIM',
    'OBSERVATION',
    'HUMAN_REVIEW',
    'DERIVED_INTERPRETATION',
  ];
  for (const [claim, types] of Object.entries(input.requiredEvidenceTypes ?? {})) {
    if (!claim.trim() || types.length === 0 || types.some((type) => !evidenceTypes.includes(type))) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', 'Required evidence-type configuration is invalid.');
    }
  }
  const authorityWeights = Object.fromEntries(authorityLevels.map((level) => [
    level,
    input.authorityWeights?.[level] ?? defaults.authorityWeights[level],
  ])) as Record<EvidenceAuthorityLevel, number>;
  const reliabilityWeights = Object.fromEntries(reliabilityLevels.map((level) => [
    level,
    input.reliabilityWeights?.[level] ?? defaults.reliabilityWeights[level],
  ])) as Record<EvidenceReliability, number>;
  const configuration: ProductTruthConfiguration = {
    ...defaults,
    ...input,
    stringNormalization: { ...defaults.stringNormalization, ...input.stringNormalization },
    booleanAliases: {
      trueValues: normalizedStringList(
        input.booleanAliases?.trueValues ?? defaults.booleanAliases.trueValues,
        'booleanAliases.trueValues',
      ),
      falseValues: normalizedStringList(
        input.booleanAliases?.falseValues ?? defaults.booleanAliases.falseValues,
        'booleanAliases.falseValues',
      ),
    },
    unitAliases: Object.fromEntries(Object.entries(input.unitAliases ?? defaults.unitAliases)
      .map(([key, value]) => [key.trim().toLocaleLowerCase(), value.trim().toLocaleLowerCase()])
      .filter(([key, value]) => key && value)),
    valueAliases: Object.fromEntries(Object.entries(input.valueAliases ?? defaults.valueAliases)
      .map(([claim, aliases]) => [claim.trim(), Object.fromEntries(Object.entries(aliases)
        .map(([key, value]) => [key.trim().toLocaleLowerCase(), value.trim()])
        .filter(([key, value]) => key && value))])),
    claimAliases: Object.fromEntries(Object.entries(input.claimAliases ?? defaults.claimAliases)
      .map(([key, value]) => [key.trim().toLocaleLowerCase(), value.trim().toLocaleLowerCase()])
      .filter(([key, value]) => key && value && value.includes('.'))),
    requiredEvidenceTypes: Object.fromEntries(Object.entries(
      input.requiredEvidenceTypes ?? defaults.requiredEvidenceTypes,
    ).map(([key, values]) => [key.trim(), [...new Set(values)].sort()])),
    unorderedListClaims: [...new Set(input.unorderedListClaims ?? defaults.unorderedListClaims)].sort(),
    authorityWeights,
    reliabilityWeights,
    freshness: { ...defaults.freshness, ...input.freshness },
    claimImportanceDefaults: {
      ...defaults.claimImportanceDefaults,
      ...input.claimImportanceDefaults,
    },
    blockingImportances: [...new Set(input.blockingImportances ?? defaults.blockingImportances)],
  };

  for (const [field, value] of [
    ['sourceDiversityWeight', configuration.sourceDiversityWeight],
    ['aiDerivedPenalty', configuration.aiDerivedPenalty],
    ['verifiedThreshold', configuration.verifiedThreshold],
    ['likelyThreshold', configuration.likelyThreshold],
    ['conflictThreshold', configuration.conflictThreshold],
    ['authorityDominanceMargin', configuration.authorityDominanceMargin],
    ['missingProvenanceConfidenceCeiling', configuration.missingProvenanceConfidenceCeiling],
    ['aiOnlyConfidenceCeiling', configuration.aiOnlyConfidenceCeiling],
    ['merchantListingOnlyConfidenceCeiling', configuration.merchantListingOnlyConfidenceCeiling],
    ['maximumConfidence', configuration.maximumConfidence],
    ['lowConfidenceIssueThreshold', configuration.lowConfidenceIssueThreshold],
    ['freshness.weight', configuration.freshness.weight],
    ['freshness.staleThreshold', configuration.freshness.staleThreshold],
    ...Object.entries(authorityWeights).map(([key, value]) => [`authorityWeights.${key}`, value] as const),
    ...Object.entries(reliabilityWeights).map(([key, value]) => [`reliabilityWeights.${key}`, value] as const),
  ] as readonly (readonly [string, number])[]) assertUnitInterval(value, field);
  for (const [field, value] of [
    ['minimumUsableEvidence', configuration.minimumUsableEvidence],
    ['minimumVerifiedEvidence', configuration.minimumVerifiedEvidence],
    ['minimumLikelyEvidence', configuration.minimumLikelyEvidence],
  ] as const) assertCount(value, field);
  if (configuration.likelyThreshold >= configuration.verifiedThreshold) {
    throw new IntelligenceDomainError(
      'INVALID_CONFIDENCE',
      'Product Truth likely threshold must be below the verified threshold.',
    );
  }
  if (configuration.maximumConfidence < configuration.verifiedThreshold) {
    throw new IntelligenceDomainError(
      'INVALID_CONFIDENCE',
      'Product Truth maximum confidence must permit the verified threshold.',
    );
  }
  if (configuration.minimumVerifiedEvidence < configuration.minimumLikelyEvidence) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Verified evidence requirements cannot be lower than likely requirements.',
    );
  }
  if (configuration.duplicateSourceTreatment !== 'STRONGEST_ONLY'
    && configuration.duplicateSourceTreatment !== 'DIMINISHING') {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Duplicate-source treatment is unsupported.');
  }
  if (configuration.stringNormalization.unicodeMode !== 'NFC'
    && configuration.stringNormalization.unicodeMode !== 'NFKC') {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Unicode normalization mode is unsupported.');
  }
  assertImportance(configuration.defaultImportance, 'defaultImportance');
  assertImportance(
    configuration.insufficientEvidenceIssueMinimumImportance,
    'insufficientEvidenceIssueMinimumImportance',
  );
  for (const value of configuration.blockingImportances) assertImportance(value, 'blockingImportances');
  for (const value of Object.values(configuration.claimImportanceDefaults)) {
    assertImportance(value, 'claimImportanceDefaults');
  }
  const overlap = configuration.booleanAliases.trueValues
    .filter((value) => configuration.booleanAliases.falseValues.includes(value));
  if (overlap.length) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Boolean aliases cannot overlap.');
  }
  return immutableCopy(configuration) as ProductTruthConfiguration;
}

export function claimImportanceFor(
  namespace: string,
  key: string,
  configuration: ProductTruthConfiguration,
): ClaimImportance {
  return configuration.claimImportanceDefaults[`${namespace}.${key}`] ?? configuration.defaultImportance;
}
