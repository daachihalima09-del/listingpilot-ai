import type { DetectiveFinding } from '../ai-detective/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceIssue,
  IssueSeverity,
  NormalizedProduct,
} from '../domain/types.ts';
import type {
  Recommendation,
  RecommendationImpact,
} from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import { analyzeProblemConcentration } from './concentration.ts';
import { percentageOf } from './grade.ts';
import type { CatalogProblem } from './types.ts';
import { canonicalIssueFamily } from './upstream.ts';

const severityRank: Readonly<Record<IssueSeverity, number>> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
const impactRank: Readonly<Record<RecommendationImpact, number>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

interface ProblemDraft {
  canonicalKey: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  productIds: Set<string>;
  blockerProductIds: Set<string>;
  issueIds: Set<string>;
  contradictionIds: Set<string>;
  recommendationIds: Set<string>;
  occurrences: number;
  confidenceTotal: number;
  confidenceCount: number;
  impact: RecommendationImpact;
}

function draftFor(
  drafts: Map<string, ProblemDraft>,
  canonicalKey: string,
  seed: Pick<ProblemDraft, 'title' | 'description' | 'severity'>,
): ProblemDraft {
  const current = drafts.get(canonicalKey);
  if (current) return current;
  const draft: ProblemDraft = {
    canonicalKey,
    ...seed,
    productIds: new Set(),
    blockerProductIds: new Set(),
    issueIds: new Set(),
    contradictionIds: new Set(),
    recommendationIds: new Set(),
    occurrences: 0,
    confidenceTotal: 0,
    confidenceCount: 0,
    impact: 'LOW',
  };
  drafts.set(canonicalKey, draft);
  return draft;
}

export function aggregateCatalogProblems(input: {
  readonly products: readonly NormalizedProduct[];
  readonly issues: readonly IntelligenceIssue[];
  readonly detectiveFindings: readonly DetectiveFinding[];
  readonly recommendations: readonly Recommendation[];
  readonly assessmentConfidence: number;
  readonly configuration: CatalogHealthConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly CatalogProblem[] {
  const drafts = new Map<string, ProblemDraft>();
  const issueFamilyById = new Map<string, string>();
  const contradictionFamilyById = new Map<string, string>();
  for (const issue of [...input.issues].sort((left, right) => left.id.localeCompare(right.id))) {
    const canonicalKey = canonicalIssueFamily(issue, input.configuration);
    issueFamilyById.set(issue.id, canonicalKey);
    const draft = draftFor(drafts, canonicalKey, {
      title: issue.title,
      description: issue.explanation,
      severity: issue.severity,
    });
    draft.occurrences += 1;
    draft.issueIds.add(issue.id);
    for (const productId of issue.affectedProductIds) draft.productIds.add(productId);
    if (severityRank[issue.severity] > severityRank[draft.severity]) draft.severity = issue.severity;
    if (issue.confidence) {
      draft.confidenceTotal += issue.confidence.value;
      draft.confidenceCount += 1;
    }
    const contradictionId = issue.metadata.contradictionId;
    if (typeof contradictionId === 'string') {
      draft.contradictionIds.add(contradictionId);
      contradictionFamilyById.set(contradictionId, canonicalKey);
    }
  }
  const representedContradictions = new Set(
    [...drafts.values()].flatMap(({ contradictionIds }) => [...contradictionIds]),
  );
  for (const finding of [...input.detectiveFindings]
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const contradiction = finding.contradiction;
    if (representedContradictions.has(contradiction.id)) continue;
    const canonicalKey = `contradiction:${contradiction.ruleId}:${contradiction.type}`;
    const draft = draftFor(drafts, canonicalKey, {
      title: contradiction.type.replaceAll('_', ' ').toLocaleLowerCase(),
      description: contradiction.explanation,
      severity: contradiction.severity,
    });
    draft.occurrences += 1;
    draft.contradictionIds.add(contradiction.id);
    contradictionFamilyById.set(contradiction.id, canonicalKey);
    for (const productId of contradiction.affectedProductIds) draft.productIds.add(productId);
    draft.confidenceTotal += contradiction.confidence.value;
    draft.confidenceCount += 1;
  }
  const recommendationById = new Map(input.recommendations.map((recommendation) => [
    recommendation.id,
    recommendation,
  ]));
  for (const recommendation of input.recommendations) {
    const relatedFamilies = new Set(recommendation.relatedIssueIds
      .map((id) => issueFamilyById.get(id))
      .filter((value): value is string => Boolean(value)));
    for (const contradictionId of recommendation.relatedContradictionIds) {
      const family = contradictionFamilyById.get(contradictionId);
      if (family) relatedFamilies.add(family);
    }
    for (const family of relatedFamilies) {
      const draft = drafts.get(family)!;
      draft.recommendationIds.add(recommendation.id);
      if (impactRank[recommendation.estimatedImpact] > impactRank[draft.impact]) {
        draft.impact = recommendation.estimatedImpact;
      }
      if (recommendation.blockingStatus === 'BLOCKER') {
        for (const productId of recommendation.affectedProductIds) {
          draft.blockerProductIds.add(productId);
        }
      }
    }
  }
  for (const finding of input.detectiveFindings) {
    if (finding.reviewRequirement !== 'BLOCKING') continue;
    for (const draft of drafts.values()) {
      if (!draft.contradictionIds.has(finding.contradiction.id)) continue;
      for (const productId of finding.contradiction.affectedProductIds) {
        draft.blockerProductIds.add(productId);
      }
    }
  }
  const problems = [...drafts.values()].map((draft): CatalogProblem => {
    const affectedProductPercentage = percentageOf(draft.productIds.size, input.products.length);
    const concentration = analyzeProblemConcentration({
      affectedProductIds: draft.productIds,
      products: input.products,
      configuration: input.configuration,
    });
    const averageConfidence = draft.confidenceCount === 0
      ? input.assessmentConfidence / 100
      : draft.confidenceTotal / draft.confidenceCount;
    const weights = input.configuration.problemRankingWeights;
    const rankingScore = Math.round((
      affectedProductPercentage * weights.affectedPercentage
      + severityRank[draft.severity] * weights.severity
      + percentageOf(draft.blockerProductIds.size, Math.max(1, draft.productIds.size))
        / 100 * weights.blockers
      + impactRank[draft.impact] * weights.impact
      + averageConfidence * weights.confidence
      + Math.min(1, draft.occurrences / Math.max(1, input.products.length)) * weights.recurrence
      + (concentration.kind === 'CATALOG_WIDE' || concentration.kind === 'SEGMENT_CONCENTRATED'
        ? weights.concentration
        : 0)
    ) * 100) / 100;
    const stable = {
      canonicalKey: draft.canonicalKey,
      severity: draft.severity,
      impact: draft.impact,
      productIds: [...draft.productIds].sort(),
      blockerProductIds: [...draft.blockerProductIds].sort(),
      issueIds: [...draft.issueIds].sort(),
      contradictionIds: [...draft.contradictionIds].sort(),
      recommendationIds: [...draft.recommendationIds].sort(),
      occurrences: draft.occurrences,
      concentration,
      rankingScore,
    };
    const fingerprint = input.hasher.hash(stable);
    return {
      problemId: `catalog_problem_${input.hasher.hash({ canonicalKey: draft.canonicalKey })}`,
      canonicalProblemKey: draft.canonicalKey,
      title: draft.title,
      description: draft.description,
      severity: draft.severity,
      impact: draft.impact,
      affectedProducts: draft.productIds.size,
      affectedProductPercentage,
      blockerCount: draft.blockerProductIds.size,
      totalOccurrences: draft.occurrences,
      relatedIssueIds: [...draft.issueIds].sort(),
      relatedContradictionIds: [...draft.contradictionIds].sort(),
      relatedRecommendationIds: [...draft.recommendationIds]
        .filter((id) => recommendationById.has(id))
        .sort(),
      representativeProductIds: [...draft.productIds]
        .sort()
        .slice(0, input.configuration.representativeProductLimit),
      concentration,
      rankingScore,
      fingerprint,
    };
  });
  return immutableCopy(problems
    .sort((left, right) => (
      right.rankingScore - left.rankingScore
      || left.canonicalProblemKey.localeCompare(right.canonicalProblemKey)
    ))
    .slice(0, input.configuration.topProblemLimit)) as readonly CatalogProblem[];
}
