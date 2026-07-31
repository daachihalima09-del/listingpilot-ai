import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  DetectorExecutionRecord,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  IssueSeverity,
} from '../domain/types.ts';
import type { ProductTruthReport } from '../product-truth/types.ts';
import {
  RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
  RECOMMENDATION_INTELLIGENCE_VERSION,
  type RecommendationIntelligenceConfiguration,
} from './configuration.ts';
import { RecommendationAppropriatenessConfidenceStrategy } from './confidence.ts';
import {
  buildRecommendationDependencyGraph,
  topologicalRecommendationOrder,
  type RecommendationDependencyNode,
} from './dependency-graph.ts';
import { groupRecommendations } from './grouping.ts';
import {
  EFFORT_RANK,
  IMPACT_RANK,
  estimateMerchantEffort,
  estimateRecommendationImpact,
} from './impact-effort.ts';
import { prioritizeRecommendation } from './prioritization.ts';
import type {
  RecommendationRuleDefinition,
  RecommendationRuleRegistry,
} from './rules.ts';
import { createRecommendationPlanSummary } from './summary.ts';
import type {
  Recommendation,
  RecommendationBlockingStatus,
  RecommendationImpact,
  RecommendationPlan,
} from './types.ts';

const severityRank: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const sourcePriorityRank: Readonly<Record<IntelligenceRecommendation['priority'], number>> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

interface RecommendationDraft {
  readonly id: string;
  readonly issue: IntelligenceIssue;
  readonly sourceRecommendations: readonly IntelligenceRecommendation[];
  readonly rule: RecommendationRuleDefinition;
  readonly title: string;
  readonly explanation: string;
  readonly estimatedImpact: Recommendation['estimatedImpact'];
  readonly estimatedEffort: Recommendation['estimatedEffort'];
  readonly initialBlocker: boolean;
  readonly confidence: Recommendation['confidence'];
  readonly relatedTruthFindingIds: readonly string[];
  readonly relatedContradictionIds: readonly string[];
  readonly prioritySeed: number;
}

function strings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').sort()
    : [];
}

function applyTemplate(value: string, replacements: Readonly<Record<string, string>>): string {
  return Object.entries(replacements).reduce(
    (result, [key, replacement]) => result.replaceAll(`{${key}}`, replacement),
    value,
  );
}

function productTruthReport(
  executions: readonly DetectorExecutionRecord[],
): ProductTruthReport | undefined {
  for (const execution of executions) {
    const value = execution.metadata?.productTruthReport;
    if (value && typeof value === 'object'
      && (value as ProductTruthReport).capabilityId === 'product-truth') {
      return value as ProductTruthReport;
    }
  }
  return undefined;
}

function traceabilityFor(
  issue: IntelligenceIssue,
  truthFindingByClaimGroup: ReadonlyMap<string, string>,
): {
  readonly truthFindingIds: readonly string[];
  readonly contradictionIds: readonly string[];
} {
  const truthFindingIds = new Set(strings(issue.metadata.truthFindingIds));
  const claimGroupId = typeof issue.metadata.claimGroupId === 'string'
    ? issue.metadata.claimGroupId
    : undefined;
  if (claimGroupId) {
    const findingId = truthFindingByClaimGroup.get(claimGroupId);
    if (findingId) truthFindingIds.add(findingId);
  }
  const contradictionIds = new Set<string>();
  if (typeof issue.metadata.contradictionId === 'string') {
    contradictionIds.add(issue.metadata.contradictionId);
  }
  return {
    truthFindingIds: [...truthFindingIds].sort(),
    contradictionIds: [...contradictionIds].sort(),
  };
}

function isInitialBlocker(input: {
  readonly issue: IntelligenceIssue;
  readonly rule: RecommendationRuleDefinition;
  readonly configuration: RecommendationIntelligenceConfiguration;
}): boolean {
  const policy = input.configuration.blockerPolicy;
  const contradictionType = typeof input.issue.metadata.contradictionType === 'string'
    ? input.issue.metadata.contradictionType
    : '';
  return input.rule.blockingPolicy.alwaysBlocker
    || severityRank[input.issue.severity] >= severityRank[policy.minimumSeverity]
    || policy.issueCodePrefixes.some((prefix) => input.issue.code.startsWith(prefix))
    || policy.contradictionTypes.includes(contradictionType);
}

function sourceRecommendationsByIssue(
  recommendations: readonly IntelligenceRecommendation[],
): ReadonlyMap<string, readonly IntelligenceRecommendation[]> {
  const result = new Map<string, IntelligenceRecommendation[]>();
  for (const recommendation of recommendations) {
    for (const issueId of recommendation.issueIds) {
      const group = result.get(issueId) ?? [];
      group.push(recommendation);
      result.set(issueId, group);
    }
  }
  return new Map([...result.entries()].map(([issueId, group]) => [
    issueId,
    [...group].sort((left, right) => (
      sourcePriorityRank[right.priority] - sourcePriorityRank[left.priority]
      || left.id.localeCompare(right.id)
    )),
  ]));
}

function impactIncluded(
  impact: RecommendationImpact,
  configuration: RecommendationIntelligenceConfiguration,
): boolean {
  return IMPACT_RANK[impact] >= IMPACT_RANK[configuration.minimumIncludedImpact];
}

export class RecommendationPlanner {
  private readonly configuration: RecommendationIntelligenceConfiguration;
  private readonly rules: RecommendationRuleRegistry;
  private readonly confidence: RecommendationAppropriatenessConfidenceStrategy;
  private readonly hasher: IntelligenceHasher;

  constructor(input: {
    readonly configuration: RecommendationIntelligenceConfiguration;
    readonly rules: RecommendationRuleRegistry;
    readonly confidence: RecommendationAppropriatenessConfidenceStrategy;
    readonly hasher: IntelligenceHasher;
  }) {
    this.configuration = input.configuration;
    this.rules = input.rules;
    this.confidence = input.confidence;
    this.hasher = input.hasher;
  }

  createPlan(input: {
    readonly context: IntelligenceContext;
    readonly issues: readonly IntelligenceIssue[];
    readonly recommendations: readonly IntelligenceRecommendation[];
    readonly detectorExecutions: readonly DetectorExecutionRecord[];
  }): RecommendationPlan {
    const sourceByIssue = sourceRecommendationsByIssue(input.recommendations);
    const truthReport = productTruthReport(input.detectorExecutions);
    const truthFindingByClaimGroup = new Map(
      (truthReport?.findings ?? []).map(({ claimGroupId, id }) => [claimGroupId, id]),
    );
    const drafts: RecommendationDraft[] = [];
    for (const issue of [...input.issues].sort((left, right) => left.id.localeCompare(right.id))) {
      const ruleId = typeof issue.metadata.ruleId === 'string' ? issue.metadata.ruleId : '';
      const rule = this.rules.match({
        issueCategory: issue.category,
        issueCode: issue.code,
        ruleId,
        detectorId: issue.detectorId,
        severity: issue.severity,
      });
      if (!rule || !this.configuration.enabledRecommendationCategories.includes(rule.category)) continue;
      const sourceRecommendations = sourceByIssue.get(issue.id) ?? [];
      const source = sourceRecommendations[0];
      const title = applyTemplate(rule.titleTemplate, {
        issueTitle: issue.title,
        sourceTitle: source?.title ?? `Review ${issue.title}`,
      });
      const explanation = applyTemplate(rule.explanationTemplate, {
        issueExplanation: issue.explanation,
        sourceExplanation: source?.explanation ?? issue.explanation,
      });
      const estimatedImpact = estimateRecommendationImpact({
        issue,
        sourceRecommendations,
        rule,
      });
      if (!impactIncluded(estimatedImpact, this.configuration)) continue;
      const estimatedEffort = estimateMerchantEffort({
        issue,
        sourceRecommendations,
        rule,
        configuration: this.configuration,
      });
      const traceability = traceabilityFor(issue, truthFindingByClaimGroup);
      const confidence = this.confidence.calculate({
        issue,
        sourceRecommendations,
        thresholds: input.context.confidenceThresholds,
        ruleMatched: true,
        traceable: true,
      });
      const initialBlocker = isInitialBlocker({
        issue,
        rule,
        configuration: this.configuration,
      });
      const id = `planned_recommendation_${this.hasher.hash({
        issueFingerprint: issue.fingerprint,
        issueId: issue.id,
        ruleId: rule.id,
        sourceFingerprints: sourceRecommendations.map(({ fingerprint }) => fingerprint).sort(),
      })}`;
      drafts.push({
        id,
        issue,
        sourceRecommendations,
        rule,
        title,
        explanation,
        estimatedImpact,
        estimatedEffort,
        initialBlocker,
        confidence,
        relatedTruthFindingIds: traceability.truthFindingIds,
        relatedContradictionIds: traceability.contradictionIds,
        prioritySeed: rule.priorityPolicy.baseScore + severityRank[issue.severity] * 10,
      });
    }

    const nodes: RecommendationDependencyNode[] = drafts.map((draft) => ({
      id: draft.id,
      category: draft.rule.category,
      affectedProductIds: draft.issue.affectedProductIds,
      prerequisiteCategories: draft.rule.dependsOnCategories,
      blocker: draft.initialBlocker,
      prioritySeed: draft.prioritySeed,
    }));
    const graph = buildRecommendationDependencyGraph(nodes);
    const recommendations = drafts.map((draft): Recommendation => {
      const dependencies = graph.dependenciesByRecommendationId.get(draft.id) ?? [];
      const dependentCount = graph.dependentCounts.get(draft.id) ?? 0;
      const blocker = draft.initialBlocker || dependentCount > 0;
      const priority = prioritizeRecommendation({
        issue: draft.issue,
        rule: draft.rule,
        blocker,
        confidence: draft.confidence.value,
        dependentCount,
        configuration: this.configuration,
      });
      const blockingStatus: RecommendationBlockingStatus = blocker
        ? 'BLOCKER'
        : dependencies.length > 0
          ? 'BLOCKED'
          : 'NON_BLOCKING';
      const fingerprint = this.hasher.hash({
        id: draft.id,
        category: draft.rule.category,
        severity: draft.issue.severity,
        priority,
        estimatedImpact: draft.estimatedImpact,
        estimatedEffort: draft.estimatedEffort,
        blockingStatus,
        dependencies,
        relatedIssueIds: [draft.issue.id],
        relatedTruthFindingIds: draft.relatedTruthFindingIds,
        relatedContradictionIds: draft.relatedContradictionIds,
      });
      return {
        id: draft.id,
        category: draft.rule.category,
        title: draft.title,
        explanation: draft.explanation,
        severity: draft.issue.severity,
        priority: priority.priority,
        confidence: draft.confidence,
        estimatedImpact: draft.estimatedImpact,
        estimatedEffort: draft.estimatedEffort,
        blockingStatus,
        dependencies,
        relatedIssueIds: [draft.issue.id],
        relatedTruthFindingIds: draft.relatedTruthFindingIds,
        relatedContradictionIds: draft.relatedContradictionIds,
        affectedProductIds: [...new Set(draft.issue.affectedProductIds)].sort(),
        affectedFields: [...new Set(draft.issue.affectedFields)].sort(),
        fingerprint,
        metadata: {
          recommendationRuleId: draft.rule.id,
          recommendationRuleVersion: draft.rule.version,
          sourceRecommendationIds: draft.sourceRecommendations.map(({ id }) => id),
          priorityScore: priority.score,
          priorityFactors: priority.factors,
          whyPriorityWasChosen: { ...priority.factors },
          whyMerchantShouldPerformIt: draft.explanation,
          confidenceMeaning: 'RECOMMENDATION_APPROPRIATENESS',
          deterministic: true,
        },
      };
    });
    const recommendationById = new Map(recommendations.map((recommendation) => [
      recommendation.id,
      recommendation,
    ]));
    const executionOrder = topologicalRecommendationOrder({
      recommendationIds: recommendations.map(({ id }) => id),
      dependenciesByRecommendationId: graph.dependenciesByRecommendationId,
      compare: (leftId, rightId) => {
        const left = recommendationById.get(leftId)!;
        const right = recommendationById.get(rightId)!;
        return left.priority - right.priority
          || IMPACT_RANK[right.estimatedImpact] - IMPACT_RANK[left.estimatedImpact]
          || left.id.localeCompare(right.id);
      },
    });
    const executionIndex = new Map(executionOrder.map((id, index) => [id, index]));
    const orderedRecommendations = [...recommendations].sort((left, right) => (
      (executionIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (executionIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
    const quickWins = orderedRecommendations.filter((recommendation) => (
      IMPACT_RANK[recommendation.estimatedImpact]
        >= IMPACT_RANK[this.configuration.quickWinPolicy.minimumImpact]
      && EFFORT_RANK[recommendation.estimatedEffort]
        <= EFFORT_RANK[this.configuration.quickWinPolicy.maximumEffort]
      && recommendation.dependencies.length === 0
      && (!this.configuration.quickWinPolicy.excludeBlockers
        || recommendation.blockingStatus !== 'BLOCKER')
    ));
    const quickWinIds = new Set(quickWins.map(({ id }) => id));
    const blockers = orderedRecommendations.filter(
      ({ blockingStatus }) => blockingStatus === 'BLOCKER',
    );
    const blockerIds = new Set(blockers.map(({ id }) => id));
    const longTermImprovements = orderedRecommendations.filter((recommendation) => (
      !quickWinIds.has(recommendation.id)
      && !blockerIds.has(recommendation.id)
      && EFFORT_RANK[recommendation.estimatedEffort]
        >= EFFORT_RANK[this.configuration.longTermMinimumEffort]
    ));
    const groups = groupRecommendations({
      recommendations: orderedRecommendations,
      executionOrder,
      configuration: this.configuration,
      hasher: this.hasher,
    });
    const summary = createRecommendationPlanSummary({
      recommendations: orderedRecommendations,
      groupCount: groups.length,
      quickWinIds,
    });
    const stable = {
      capabilityId: RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
      capabilityVersion: RECOMMENDATION_INTELLIGENCE_VERSION,
      productIds: input.context.products.map(({ id }) => id).sort(),
      recommendationFingerprints: orderedRecommendations.map(({ fingerprint }) => fingerprint),
      groupFingerprints: groups.map(({ fingerprint }) => fingerprint),
      executionOrder,
      summary,
    };
    return immutableCopy({
      schemaVersion: RECOMMENDATION_INTELLIGENCE_VERSION,
      capabilityId: RECOMMENDATION_INTELLIGENCE_CAPABILITY_ID,
      capabilityVersion: RECOMMENDATION_INTELLIGENCE_VERSION,
      productsAnalyzed: input.context.products.length,
      totalRecommendations: orderedRecommendations.length,
      groupedRecommendations: groups,
      executionOrder,
      highestPriority: orderedRecommendations.length > 0
        ? Math.min(...orderedRecommendations.map(({ priority }) => priority)) as Recommendation['priority']
        : null,
      blockers,
      quickWins,
      longTermImprovements,
      summary,
      fingerprint: this.hasher.hash(stable),
      createdAt: input.context.execution.requestedAt,
    }) as RecommendationPlan;
  }
}
