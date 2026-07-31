import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { IssueSeverity } from '../domain/types.ts';
import type {
  MerchantEffort,
  RecommendationCategory,
  RecommendationImpact,
} from './types.ts';

export const RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID = 'recommendation-intelligence';
export const RECOMMENDATION_INTELLIGENCE_VERSION = '1.0.0';

export const RECOMMENDATION_CATEGORIES: readonly RecommendationCategory[] = Object.freeze([
  'DATA_COMPLETENESS',
  'PRODUCT_TRUTH',
  'CONTRADICTION',
  'SEO',
  'MEDIA',
  'IDENTITY',
  'VARIANTS',
  'CATALOG',
  'PUBLISHING_READINESS',
]);

export interface RecommendationGroupingPolicy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly order: number;
}

export interface RecommendationIntelligenceConfiguration {
  readonly enabledRecommendationCategories: readonly RecommendationCategory[];
  readonly minimumIncludedImpact: RecommendationImpact;
  readonly priorityThresholds: {
    readonly priority1Minimum: number;
    readonly priority2Minimum: number;
    readonly priority3Minimum: number;
    readonly priority4Minimum: number;
  };
  readonly effortThresholds: {
    readonly trivialMaximumFields: number;
    readonly smallMaximumFields: number;
    readonly mediumMaximumFields: number;
  };
  readonly blockerPolicy: {
    readonly minimumSeverity: IssueSeverity;
    readonly issueCodePrefixes: readonly string[];
    readonly contradictionTypes: readonly string[];
  };
  readonly quickWinPolicy: {
    readonly minimumImpact: RecommendationImpact;
    readonly maximumEffort: MerchantEffort;
    readonly excludeBlockers: boolean;
  };
  readonly longTermMinimumEffort: MerchantEffort;
  readonly groupingPolicies: Readonly<Record<RecommendationCategory, RecommendationGroupingPolicy>>;
}

export interface RecommendationIntelligenceConfigurationInput {
  readonly enabledRecommendationCategories?: readonly RecommendationCategory[];
  readonly minimumIncludedImpact?: RecommendationImpact;
  readonly priorityThresholds?: Partial<RecommendationIntelligenceConfiguration['priorityThresholds']>;
  readonly effortThresholds?: Partial<RecommendationIntelligenceConfiguration['effortThresholds']>;
  readonly blockerPolicy?: Partial<RecommendationIntelligenceConfiguration['blockerPolicy']>;
  readonly quickWinPolicy?: Partial<RecommendationIntelligenceConfiguration['quickWinPolicy']>;
  readonly longTermMinimumEffort?: MerchantEffort;
  readonly groupingPolicies?: Partial<Readonly<Record<
    RecommendationCategory,
    Partial<RecommendationGroupingPolicy>
  >>>;
}

const impacts: readonly RecommendationImpact[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const efforts: readonly MerchantEffort[] = ['TRIVIAL', 'SMALL', 'MEDIUM', 'LARGE'];
const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const groupNames: Readonly<Record<RecommendationCategory, string>> = {
  DATA_COMPLETENESS: 'Data completeness',
  PRODUCT_TRUTH: 'Product Truth',
  CONTRADICTION: 'Contradictions',
  SEO: 'SEO',
  MEDIA: 'Media',
  IDENTITY: 'Identity',
  VARIANTS: 'Variants',
  CATALOG: 'Catalog',
  PUBLISHING_READINESS: 'Publishing readiness',
};

const groupingPolicies = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((category, index) => [
  category,
  {
    id: `recommendation-group.${category.toLocaleLowerCase().replaceAll('_', '-')}`,
    name: groupNames[category],
    description: `Recommendations classified as ${groupNames[category].toLocaleLowerCase()}.`,
    order: index + 1,
  },
])) as Record<RecommendationCategory, RecommendationGroupingPolicy>;

const defaults: RecommendationIntelligenceConfiguration = {
  enabledRecommendationCategories: RECOMMENDATION_CATEGORIES,
  minimumIncludedImpact: 'LOW',
  priorityThresholds: {
    priority1Minimum: 120,
    priority2Minimum: 95,
    priority3Minimum: 70,
    priority4Minimum: 45,
  },
  effortThresholds: {
    trivialMaximumFields: 0,
    smallMaximumFields: 1,
    mediumMaximumFields: 3,
  },
  blockerPolicy: {
    minimumSeverity: 'CRITICAL',
    issueCodePrefixes: [
      'truth.claim.conflicted',
      'truth.claim.unresolved',
      'detective.value_conflict',
      'detective.impossible_combination',
    ],
    contradictionTypes: ['IMPOSSIBLE_COMBINATION'],
  },
  quickWinPolicy: {
    minimumImpact: 'HIGH',
    maximumEffort: 'SMALL',
    excludeBlockers: true,
  },
  longTermMinimumEffort: 'MEDIUM',
  groupingPolicies,
};

function nonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} must be a non-negative integer.`);
  }
}

function normalizedPrefixes(values: readonly string[], field: string): readonly string[] {
  if (values.some((value) => !value.trim())) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', `${field} cannot contain empty values.`);
  }
  return [...new Set(values.map((value) => value.trim()))].sort();
}

export function createRecommendationIntelligenceConfiguration(
  input: RecommendationIntelligenceConfigurationInput = {},
): RecommendationIntelligenceConfiguration {
  for (const key of Object.keys(input.groupingPolicies ?? {})) {
    if (!RECOMMENDATION_CATEGORIES.includes(key as RecommendationCategory)) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        `Grouping policy category ${key} is unsupported.`,
      );
    }
  }
  const enabled = input.enabledRecommendationCategories ?? defaults.enabledRecommendationCategories;
  if (enabled.some((category) => !RECOMMENDATION_CATEGORIES.includes(category))) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Recommendation categories contain an unsupported value.');
  }
  const minimumIncludedImpact = input.minimumIncludedImpact ?? defaults.minimumIncludedImpact;
  const longTermMinimumEffort = input.longTermMinimumEffort ?? defaults.longTermMinimumEffort;
  const priorityThresholds = { ...defaults.priorityThresholds, ...input.priorityThresholds };
  const effortThresholds = { ...defaults.effortThresholds, ...input.effortThresholds };
  const blockerPolicy = {
    ...defaults.blockerPolicy,
    ...input.blockerPolicy,
    issueCodePrefixes: normalizedPrefixes(
      input.blockerPolicy?.issueCodePrefixes ?? defaults.blockerPolicy.issueCodePrefixes,
      'blockerPolicy.issueCodePrefixes',
    ),
    contradictionTypes: normalizedPrefixes(
      input.blockerPolicy?.contradictionTypes ?? defaults.blockerPolicy.contradictionTypes,
      'blockerPolicy.contradictionTypes',
    ),
  };
  const quickWinPolicy = { ...defaults.quickWinPolicy, ...input.quickWinPolicy };
  if (!impacts.includes(minimumIncludedImpact)
    || !impacts.includes(quickWinPolicy.minimumImpact)
    || !efforts.includes(quickWinPolicy.maximumEffort)
    || !efforts.includes(longTermMinimumEffort)
    || !severities.includes(blockerPolicy.minimumSeverity)) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Recommendation policy contains an unsupported level.');
  }
  const priorityValues = [
    priorityThresholds.priority1Minimum,
    priorityThresholds.priority2Minimum,
    priorityThresholds.priority3Minimum,
    priorityThresholds.priority4Minimum,
  ];
  if (priorityValues.some((value) => !Number.isFinite(value) || value < 0)
    || !(priorityValues[0] > priorityValues[1]
      && priorityValues[1] > priorityValues[2]
      && priorityValues[2] > priorityValues[3])) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Recommendation priority thresholds must be descending non-negative values.',
    );
  }
  nonNegativeInteger(effortThresholds.trivialMaximumFields, 'effortThresholds.trivialMaximumFields');
  nonNegativeInteger(effortThresholds.smallMaximumFields, 'effortThresholds.smallMaximumFields');
  nonNegativeInteger(effortThresholds.mediumMaximumFields, 'effortThresholds.mediumMaximumFields');
  if (!(effortThresholds.trivialMaximumFields <= effortThresholds.smallMaximumFields
    && effortThresholds.smallMaximumFields <= effortThresholds.mediumMaximumFields)) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Recommendation effort thresholds must be ordered.',
    );
  }
  const configuredGroups = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((category) => {
    const policy = {
      ...defaults.groupingPolicies[category],
      ...input.groupingPolicies?.[category],
    };
    if (!policy.id.trim() || !policy.name.trim() || !policy.description.trim()
      || !Number.isInteger(policy.order) || policy.order < 0) {
      throw new IntelligenceDomainError('INVALID_CONTEXT', `Grouping policy for ${category} is invalid.`);
    }
    return [category, policy];
  })) as Record<RecommendationCategory, RecommendationGroupingPolicy>;
  if (new Set(Object.values(configuredGroups).map(({ id }) => id)).size !== RECOMMENDATION_CATEGORIES.length) {
    throw new IntelligenceDomainError('INVALID_CONTEXT', 'Recommendation grouping IDs must be unique.');
  }
  return immutableCopy({
    enabledRecommendationCategories: [...new Set(enabled)].sort(),
    minimumIncludedImpact,
    priorityThresholds,
    effortThresholds,
    blockerPolicy,
    quickWinPolicy,
    longTermMinimumEffort,
    groupingPolicies: configuredGroups,
  }) as RecommendationIntelligenceConfiguration;
}
