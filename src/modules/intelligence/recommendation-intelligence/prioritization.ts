import type { IntelligenceIssue, IssueSeverity } from '../domain/types.ts';
import type { RecommendationIntelligenceConfiguration } from './configuration.ts';
import type { RecommendationRuleDefinition } from './rules.ts';
import type {
  RecommendationPlanPriority,
} from './types.ts';

const severityScore: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 10,
  MEDIUM: 25,
  HIGH: 40,
  CRITICAL: 55,
};

const importanceScore: Readonly<Record<string, number>> = {
  INFORMATIONAL: 0,
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
  CRITICAL: 1,
};

export interface RecommendationPriorityResult {
  readonly priority: RecommendationPlanPriority;
  readonly score: number;
  readonly factors: Readonly<{
    base: number;
    severity: number;
    blocking: number;
    confidence: number;
    businessImportance: number;
    dependencyUnlock: number;
  }>;
}

export function prioritizeRecommendation(input: {
  readonly issue: IntelligenceIssue;
  readonly rule: RecommendationRuleDefinition;
  readonly blocker: boolean;
  readonly confidence: number;
  readonly dependentCount: number;
  readonly configuration: RecommendationIntelligenceConfiguration;
}): RecommendationPriorityResult {
  const businessImportance = typeof input.issue.metadata.importance === 'string'
    ? importanceScore[input.issue.metadata.importance] ?? 0
    : 0;
  const factors = {
    base: input.rule.priorityPolicy.baseScore,
    severity: severityScore[input.issue.severity],
    blocking: input.blocker ? input.rule.priorityPolicy.blockingBonus : 0,
    confidence: Math.round(input.confidence * input.rule.priorityPolicy.confidenceWeight),
    businessImportance: Math.round(
      businessImportance * input.rule.priorityPolicy.businessImportanceWeight,
    ),
    dependencyUnlock: Math.min(
      input.rule.priorityPolicy.unlockBonusMaximum,
      input.dependentCount * 4,
    ),
  };
  const score = Object.values(factors).reduce((sum, value) => sum + value, 0);
  const thresholds = input.configuration.priorityThresholds;
  const priority: RecommendationPlanPriority = score >= thresholds.priority1Minimum
    ? 1
    : score >= thresholds.priority2Minimum
      ? 2
      : score >= thresholds.priority3Minimum
        ? 3
        : score >= thresholds.priority4Minimum
          ? 4
          : 5;
  return { priority, score, factors };
}
