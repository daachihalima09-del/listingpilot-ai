import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { IssueSeverity } from '../domain/types.ts';
import type {
  CatalogPublishingReadiness,
  CatalogSegmentType,
  HealthDimensionId,
} from './types.ts';

export const CATALOG_HEALTH_CAPABILITY_ID = 'catalog-health';
export const CATALOG_HEALTH_VERSION = '1.0.0';

export const HEALTH_DIMENSIONS: readonly HealthDimensionId[] = Object.freeze([
  'IDENTITY',
  'DATA_COMPLETENESS',
  'PRODUCT_TRUTH',
  'CONSISTENCY',
  'SEO',
  'MEDIA',
  'VARIANTS',
  'PRICING',
  'SPECIFICATIONS',
  'CATALOG_INTEGRITY',
  'PUBLISHING_READINESS',
]);

export const DEFAULT_HEALTH_DIMENSIONS: readonly HealthDimensionId[] = Object.freeze([
  'PRODUCT_TRUTH',
  'DATA_COMPLETENESS',
  'CONSISTENCY',
  'IDENTITY',
  'SPECIFICATIONS',
  'VARIANTS',
  'SEO',
  'MEDIA',
  'PRICING',
]);

export interface CatalogHealthGradeThresholds {
  readonly A: number;
  readonly B: number;
  readonly C: number;
  readonly D: number;
  readonly F: number;
}

export interface CatalogHealthStatusThresholds {
  readonly excellentMinimum: number;
  readonly healthyMinimum: number;
  readonly needsAttentionMinimum: number;
  readonly poorMinimum: number;
  readonly insufficientConfidenceBelow: number;
  readonly criticalBlockedPercentage: number;
  readonly excellentMaximumBlockedPercentage: number;
}

export interface CatalogHealthSegmentPolicy {
  readonly type: CatalogSegmentType;
  readonly metadataKey?: string;
  readonly includeMissing: boolean;
  readonly excludedKeys: readonly string[];
}

export interface CatalogHealthConfiguration {
  readonly enabledDimensions: readonly HealthDimensionId[];
  readonly dimensionWeights: Readonly<Record<HealthDimensionId, number>>;
  readonly normalizeEnabledWeights: boolean;
  readonly issueSeverityPenalties: Readonly<Record<IssueSeverity, number>>;
  readonly contradictionPenalties: Readonly<Record<IssueSeverity, number>>;
  readonly blockerPenalties: {
    readonly perProduct: number;
    readonly catalogPerAffectedPercentage: number;
    readonly maximumCatalogPenalty: number;
  };
  readonly insufficientAnalysisPenalties: {
    readonly perProduct: number;
    readonly maximumCatalogPenalty: number;
  };
  readonly healthGradeThresholds: CatalogHealthGradeThresholds;
  readonly healthStatusThresholds: CatalogHealthStatusThresholds;
  readonly readinessMappings: {
    readonly criticalIssue: CatalogPublishingReadiness;
    readonly highIssue: CatalogPublishingReadiness;
    readonly mediumIssue: CatalogPublishingReadiness;
    readonly lowIssue: CatalogPublishingReadiness;
  };
  readonly assessmentConfidenceWeights: {
    readonly capabilityCoverage: number;
    readonly evidenceCoverage: number;
    readonly provenanceCoverage: number;
    readonly detectiveCoverage: number;
    readonly recommendationCoverage: number;
  };
  readonly minimumCoveragePercentage: number;
  readonly problemRankingWeights: {
    readonly affectedPercentage: number;
    readonly severity: number;
    readonly blockers: number;
    readonly impact: number;
    readonly confidence: number;
    readonly recurrence: number;
    readonly concentration: number;
  };
  readonly focusAreaLimit: number;
  readonly includeQuickWins: boolean;
  readonly segmentPolicies: readonly CatalogHealthSegmentPolicy[];
  readonly minimumSegmentSize: number;
  readonly maximumSegments: number;
  readonly concentrationThresholds: {
    readonly catalogWideAffectedPercentage: number;
    readonly segmentAffectedSharePercentage: number;
    readonly isolatedMaximumProducts: number;
  };
  readonly representativeProductLimit: number;
  readonly topProblemLimit: number;
  readonly antiDoubleCounting: {
    readonly canonicalMetadataKeys: readonly string[];
    readonly maximumPenaltyPerFamily: number;
  };
}

export interface CatalogHealthConfigurationInput {
  readonly enabledDimensions?: readonly HealthDimensionId[];
  readonly dimensionWeights?: Partial<Readonly<Record<HealthDimensionId, number>>>;
  readonly normalizeEnabledWeights?: boolean;
  readonly issueSeverityPenalties?: Partial<Readonly<Record<IssueSeverity, number>>>;
  readonly contradictionPenalties?: Partial<Readonly<Record<IssueSeverity, number>>>;
  readonly blockerPenalties?: Partial<CatalogHealthConfiguration['blockerPenalties']>;
  readonly insufficientAnalysisPenalties?: Partial<
    CatalogHealthConfiguration['insufficientAnalysisPenalties']
  >;
  readonly healthGradeThresholds?: Partial<CatalogHealthGradeThresholds>;
  readonly healthStatusThresholds?: Partial<CatalogHealthStatusThresholds>;
  readonly readinessMappings?: Partial<CatalogHealthConfiguration['readinessMappings']>;
  readonly assessmentConfidenceWeights?: Partial<
    CatalogHealthConfiguration['assessmentConfidenceWeights']
  >;
  readonly minimumCoveragePercentage?: number;
  readonly problemRankingWeights?: Partial<CatalogHealthConfiguration['problemRankingWeights']>;
  readonly focusAreaLimit?: number;
  readonly includeQuickWins?: boolean;
  readonly segmentPolicies?: readonly CatalogHealthSegmentPolicy[];
  readonly minimumSegmentSize?: number;
  readonly maximumSegments?: number;
  readonly concentrationThresholds?: Partial<
    CatalogHealthConfiguration['concentrationThresholds']
  >;
  readonly representativeProductLimit?: number;
  readonly topProblemLimit?: number;
  readonly antiDoubleCounting?: Partial<CatalogHealthConfiguration['antiDoubleCounting']>;
}

const zeroWeights = Object.fromEntries(
  HEALTH_DIMENSIONS.map((id) => [id, 0]),
) as Record<HealthDimensionId, number>;

const defaults: CatalogHealthConfiguration = {
  enabledDimensions: DEFAULT_HEALTH_DIMENSIONS,
  dimensionWeights: {
    ...zeroWeights,
    PRODUCT_TRUTH: 20,
    DATA_COMPLETENESS: 15,
    CONSISTENCY: 15,
    IDENTITY: 10,
    SPECIFICATIONS: 10,
    VARIANTS: 10,
    SEO: 8,
    MEDIA: 7,
    PRICING: 5,
  },
  normalizeEnabledWeights: false,
  issueSeverityPenalties: { INFO: 0, LOW: 4, MEDIUM: 10, HIGH: 20, CRITICAL: 35 },
  contradictionPenalties: { INFO: 0, LOW: 6, MEDIUM: 12, HIGH: 24, CRITICAL: 40 },
  blockerPenalties: {
    perProduct: 20,
    catalogPerAffectedPercentage: 0.2,
    maximumCatalogPenalty: 20,
  },
  insufficientAnalysisPenalties: {
    perProduct: 15,
    maximumCatalogPenalty: 20,
  },
  healthGradeThresholds: { A: 90, B: 80, C: 70, D: 60, F: 0 },
  healthStatusThresholds: {
    excellentMinimum: 90,
    healthyMinimum: 80,
    needsAttentionMinimum: 60,
    poorMinimum: 40,
    insufficientConfidenceBelow: 50,
    criticalBlockedPercentage: 25,
    excellentMaximumBlockedPercentage: 0,
  },
  readinessMappings: {
    criticalIssue: 'BLOCKED',
    highIssue: 'REVIEW_REQUIRED',
    mediumIssue: 'REVIEW_RECOMMENDED',
    lowIssue: 'READY_WITH_WARNINGS',
  },
  assessmentConfidenceWeights: {
    capabilityCoverage: 40,
    evidenceCoverage: 25,
    provenanceCoverage: 15,
    detectiveCoverage: 10,
    recommendationCoverage: 10,
  },
  minimumCoveragePercentage: 60,
  problemRankingWeights: {
    affectedPercentage: 0.4,
    severity: 10,
    blockers: 20,
    impact: 5,
    confidence: 10,
    recurrence: 10,
    concentration: 5,
  },
  focusAreaLimit: 5,
  includeQuickWins: true,
  segmentPolicies: [],
  minimumSegmentSize: 2,
  maximumSegments: 100,
  concentrationThresholds: {
    catalogWideAffectedPercentage: 50,
    segmentAffectedSharePercentage: 70,
    isolatedMaximumProducts: 3,
  },
  representativeProductLimit: 5,
  topProblemLimit: 10,
  antiDoubleCounting: {
    canonicalMetadataKeys: ['claimGroupId', 'contradictionId', 'semanticDetectorId', 'ruleId'],
    maximumPenaltyPerFamily: 40,
  },
};

function percentage(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must be between 0 and 100.`);
  }
}

function positiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must be a positive integer.`);
  }
}

function assertDescending(values: readonly number[], field: string): void {
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 100)
    || values.some((value, index) => index > 0 && values[index - 1] <= value)) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      `${field} must contain strictly descending non-overlapping thresholds.`,
    );
  }
}

export function createCatalogHealthConfiguration(
  input: CatalogHealthConfigurationInput = {},
): CatalogHealthConfiguration {
  const enabledDimensions = [...new Set(input.enabledDimensions ?? defaults.enabledDimensions)];
  if (enabledDimensions.length === 0
    || enabledDimensions.some((id) => !HEALTH_DIMENSIONS.includes(id))) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Catalog Health requires unique supported enabled dimensions.',
    );
  }
  if ((input.enabledDimensions?.length ?? enabledDimensions.length) !== enabledDimensions.length) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Catalog Health dimensions cannot be duplicated.');
  }
  for (const key of Object.keys(input.dimensionWeights ?? {})) {
    if (!HEALTH_DIMENSIONS.includes(key as HealthDimensionId)) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', `Unsupported health dimension ${key}.`);
    }
  }
  const dimensionWeights = {
    ...defaults.dimensionWeights,
    ...input.dimensionWeights,
  };
  if (Object.values(dimensionWeights).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Dimension weights cannot be negative.');
  }
  const normalizeEnabledWeights = input.normalizeEnabledWeights ?? defaults.normalizeEnabledWeights;
  const enabledWeight = enabledDimensions.reduce((sum, id) => sum + dimensionWeights[id], 0);
  if (enabledWeight <= 0 || (!normalizeEnabledWeights && Math.abs(enabledWeight - 100) > 0.000001)) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Enabled dimension weights must total 100 unless explicit normalization is enabled.',
    );
  }
  const issueSeverityPenalties = {
    ...defaults.issueSeverityPenalties,
    ...input.issueSeverityPenalties,
  };
  const contradictionPenalties = {
    ...defaults.contradictionPenalties,
    ...input.contradictionPenalties,
  };
  if ([...Object.values(issueSeverityPenalties), ...Object.values(contradictionPenalties)]
    .some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Health penalties must be between 0 and 100.');
  }
  const blockerPenalties = { ...defaults.blockerPenalties, ...input.blockerPenalties };
  const insufficientAnalysisPenalties = {
    ...defaults.insufficientAnalysisPenalties,
    ...input.insufficientAnalysisPenalties,
  };
  for (const [key, value] of Object.entries(blockerPenalties)) {
    percentage(value, `blockerPenalties.${key}`);
  }
  for (const [key, value] of Object.entries(insufficientAnalysisPenalties)) {
    percentage(value, `insufficientAnalysisPenalties.${key}`);
  }
  const healthGradeThresholds = {
    ...defaults.healthGradeThresholds,
    ...input.healthGradeThresholds,
  };
  assertDescending([
    healthGradeThresholds.A,
    healthGradeThresholds.B,
    healthGradeThresholds.C,
    healthGradeThresholds.D,
  ], 'healthGradeThresholds');
  if (healthGradeThresholds.F !== 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'The F grade must begin at zero.');
  }
  const healthStatusThresholds = {
    ...defaults.healthStatusThresholds,
    ...input.healthStatusThresholds,
  };
  assertDescending([
    healthStatusThresholds.excellentMinimum,
    healthStatusThresholds.healthyMinimum,
    healthStatusThresholds.needsAttentionMinimum,
    healthStatusThresholds.poorMinimum,
  ], 'healthStatusThresholds');
  percentage(healthStatusThresholds.insufficientConfidenceBelow, 'insufficientConfidenceBelow');
  percentage(healthStatusThresholds.criticalBlockedPercentage, 'criticalBlockedPercentage');
  percentage(
    healthStatusThresholds.excellentMaximumBlockedPercentage,
    'excellentMaximumBlockedPercentage',
  );
  const validReadiness: readonly CatalogPublishingReadiness[] = [
    'READY',
    'READY_WITH_WARNINGS',
    'REVIEW_RECOMMENDED',
    'REVIEW_REQUIRED',
    'BLOCKED',
    'UNKNOWN',
  ];
  const readinessMappings = { ...defaults.readinessMappings, ...input.readinessMappings };
  if (Object.values(readinessMappings).some((value) => !validReadiness.includes(value))) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Readiness mappings contain an unsupported state.');
  }
  const readinessRank: Readonly<Record<CatalogPublishingReadiness, number>> = {
    UNKNOWN: 0,
    READY: 1,
    READY_WITH_WARNINGS: 2,
    REVIEW_RECOMMENDED: 3,
    REVIEW_REQUIRED: 4,
    BLOCKED: 5,
  };
  const mappedReadiness = [
    readinessMappings.criticalIssue,
    readinessMappings.highIssue,
    readinessMappings.mediumIssue,
    readinessMappings.lowIssue,
  ];
  if (mappedReadiness.some((value, index) => (
    index > 0 && readinessRank[mappedReadiness[index - 1]] < readinessRank[value]
  ))) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Readiness mappings must not become more restrictive as issue severity decreases.',
    );
  }
  const assessmentConfidenceWeights = {
    ...defaults.assessmentConfidenceWeights,
    ...input.assessmentConfidenceWeights,
  };
  if (Object.values(assessmentConfidenceWeights).some((value) => value < 0)
    || Object.values(assessmentConfidenceWeights).reduce((sum, value) => sum + value, 0) !== 100) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Assessment-confidence weights must be non-negative and total 100.',
    );
  }
  const problemRankingWeights = {
    ...defaults.problemRankingWeights,
    ...input.problemRankingWeights,
  };
  if (Object.values(problemRankingWeights).some((value) => !Number.isFinite(value) || value < 0)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Problem-ranking weights cannot be negative.');
  }
  const segmentPolicies = input.segmentPolicies ?? defaults.segmentPolicies;
  const supportedSegments: readonly CatalogSegmentType[] = [
    'VENDOR',
    'PRODUCT_TYPE',
    'CATEGORY',
    'STATUS',
    'SOURCE',
    'METADATA',
  ];
  const policyIds = segmentPolicies.map(({ type, metadataKey }) => `${type}:${metadataKey ?? ''}`);
  if (new Set(policyIds).size !== policyIds.length
    || segmentPolicies.some(({ type }) => !supportedSegments.includes(type))
    || segmentPolicies.some(({ type, metadataKey }) => type === 'METADATA' && !metadataKey?.trim())
    || segmentPolicies.some(({ excludedKeys }) => excludedKeys.some((key) => !key.trim()))) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Catalog segment policies are invalid.');
  }
  const concentrationThresholds = {
    ...defaults.concentrationThresholds,
    ...input.concentrationThresholds,
  };
  percentage(
    concentrationThresholds.catalogWideAffectedPercentage,
    'catalogWideAffectedPercentage',
  );
  percentage(
    concentrationThresholds.segmentAffectedSharePercentage,
    'segmentAffectedSharePercentage',
  );
  positiveInteger(concentrationThresholds.isolatedMaximumProducts, 'isolatedMaximumProducts');
  const focusAreaLimit = input.focusAreaLimit ?? defaults.focusAreaLimit;
  const minimumSegmentSize = input.minimumSegmentSize ?? defaults.minimumSegmentSize;
  const maximumSegments = input.maximumSegments ?? defaults.maximumSegments;
  const representativeProductLimit = input.representativeProductLimit
    ?? defaults.representativeProductLimit;
  const topProblemLimit = input.topProblemLimit ?? defaults.topProblemLimit;
  for (const [key, value] of Object.entries({
    focusAreaLimit,
    minimumSegmentSize,
    maximumSegments,
    representativeProductLimit,
    topProblemLimit,
  })) positiveInteger(value, key);
  if (maximumSegments < segmentPolicies.length) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'maximumSegments cannot be smaller than the number of segment policies.',
    );
  }
  const antiDoubleCounting = {
    ...defaults.antiDoubleCounting,
    ...input.antiDoubleCounting,
    canonicalMetadataKeys: [
      ...new Set(
        input.antiDoubleCounting?.canonicalMetadataKeys
          ?? defaults.antiDoubleCounting.canonicalMetadataKeys,
      ),
    ],
  };
  if (antiDoubleCounting.canonicalMetadataKeys.some((key) => !key.trim())) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Anti-double-counting metadata keys cannot be empty.',
    );
  }
  percentage(antiDoubleCounting.maximumPenaltyPerFamily, 'maximumPenaltyPerFamily');
  const minimumCoveragePercentage = input.minimumCoveragePercentage
    ?? defaults.minimumCoveragePercentage;
  percentage(minimumCoveragePercentage, 'minimumCoveragePercentage');
  return immutableCopy({
    enabledDimensions: enabledDimensions.sort(),
    dimensionWeights,
    normalizeEnabledWeights,
    issueSeverityPenalties,
    contradictionPenalties,
    blockerPenalties,
    insufficientAnalysisPenalties,
    healthGradeThresholds,
    healthStatusThresholds,
    readinessMappings,
    assessmentConfidenceWeights,
    minimumCoveragePercentage,
    problemRankingWeights,
    focusAreaLimit,
    includeQuickWins: input.includeQuickWins ?? defaults.includeQuickWins,
    segmentPolicies: [...segmentPolicies]
      .map((policy) => ({
        ...policy,
        ...(policy.metadataKey ? { metadataKey: policy.metadataKey.trim() } : {}),
        excludedKeys: [...new Set(policy.excludedKeys.map((key) => key.trim()))].sort(),
      }))
      .sort((left, right) => (
        left.type.localeCompare(right.type)
        || (left.metadataKey ?? '').localeCompare(right.metadataKey ?? '')
      )),
    minimumSegmentSize,
    maximumSegments,
    concentrationThresholds,
    representativeProductLimit,
    topProblemLimit,
    antiDoubleCounting,
  }) as CatalogHealthConfiguration;
}

export const DEFAULT_CATALOG_HEALTH_CONFIGURATION = createCatalogHealthConfiguration();
