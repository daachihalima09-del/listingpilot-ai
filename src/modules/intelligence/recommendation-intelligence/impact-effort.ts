import type {
  IntelligenceIssue,
  IntelligenceRecommendation,
  IssueSeverity,
} from '../domain/types.ts';
import type { RecommendationIntelligenceConfiguration } from './configuration.ts';
import type { RecommendationRuleDefinition } from './rules.ts';
import type {
  MerchantEffort,
  RecommendationImpact,
} from './types.ts';

export const IMPACT_RANK: Readonly<Record<RecommendationImpact, number>> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const EFFORT_RANK: Readonly<Record<MerchantEffort, number>> = {
  TRIVIAL: 0,
  SMALL: 1,
  MEDIUM: 2,
  LARGE: 3,
};

const sourceImpact: Readonly<Record<IntelligenceRecommendation['estimatedImpact'], RecommendationImpact>> = {
  UNKNOWN: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

const sourceEffort: Readonly<Record<IntelligenceRecommendation['estimatedEffort'], MerchantEffort | undefined>> = {
  UNKNOWN: undefined,
  LOW: 'SMALL',
  MEDIUM: 'MEDIUM',
  HIGH: 'LARGE',
};

const importanceImpact: Readonly<Record<string, RecommendationImpact>> = {
  INFORMATIONAL: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

function maximumImpact(values: readonly RecommendationImpact[]): RecommendationImpact {
  return [...values].sort((left, right) => IMPACT_RANK[right] - IMPACT_RANK[left])[0] ?? 'LOW';
}

function maximumEffort(values: readonly MerchantEffort[]): MerchantEffort {
  return [...values].sort((left, right) => EFFORT_RANK[right] - EFFORT_RANK[left])[0] ?? 'TRIVIAL';
}

export function estimateRecommendationImpact(input: {
  readonly issue: IntelligenceIssue;
  readonly sourceRecommendations: readonly IntelligenceRecommendation[];
  readonly rule: RecommendationRuleDefinition;
}): RecommendationImpact {
  const importance = typeof input.issue.metadata.importance === 'string'
    ? importanceImpact[input.issue.metadata.importance]
    : undefined;
  return maximumImpact([
    input.rule.impactPolicy[input.issue.severity],
    ...input.sourceRecommendations.map(({ estimatedImpact }) => sourceImpact[estimatedImpact]),
    ...(importance ? [importance] : []),
  ]);
}

function effortFromFieldCount(
  count: number,
  configuration: RecommendationIntelligenceConfiguration,
): MerchantEffort {
  if (count <= configuration.effortThresholds.trivialMaximumFields) return 'TRIVIAL';
  if (count <= configuration.effortThresholds.smallMaximumFields) return 'SMALL';
  if (count <= configuration.effortThresholds.mediumMaximumFields) return 'MEDIUM';
  return 'LARGE';
}

export function estimateMerchantEffort(input: {
  readonly issue: IntelligenceIssue;
  readonly sourceRecommendations: readonly IntelligenceRecommendation[];
  readonly rule: RecommendationRuleDefinition;
  readonly configuration: RecommendationIntelligenceConfiguration;
}): MerchantEffort {
  return maximumEffort([
    input.rule.effortPolicy.defaultEffort,
    effortFromFieldCount(new Set(input.issue.affectedFields).size, input.configuration),
    ...input.sourceRecommendations.flatMap(({ estimatedEffort }) => {
      const effort = sourceEffort[estimatedEffort];
      return effort ? [effort] : [];
    }),
  ]);
}

export function aggregateImpact(
  values: readonly RecommendationImpact[],
): RecommendationImpact {
  return maximumImpact(values);
}

export function aggregateEffort(
  values: readonly MerchantEffort[],
): MerchantEffort {
  const points = values.reduce((sum, effort) => sum + [1, 2, 4, 8][EFFORT_RANK[effort]], 0);
  if (points === 0) return 'TRIVIAL';
  if (points <= 3) return 'SMALL';
  if (points <= 12) return 'MEDIUM';
  return 'LARGE';
}

export function severityImpact(severity: IssueSeverity): RecommendationImpact {
  if (severity === 'CRITICAL') return 'CRITICAL';
  if (severity === 'HIGH') return 'HIGH';
  if (severity === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}
