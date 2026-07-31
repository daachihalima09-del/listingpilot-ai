import type {
  DetectiveFinding,
} from '../ai-detective/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceIssue,
  NormalizedProduct,
  IssueSeverity,
} from '../domain/types.ts';
import type { TruthFinding } from '../product-truth/types.ts';
import type { Recommendation } from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import {
  boundedHealthScore,
  gradeForHealthScore,
  statusForHealthScore,
} from './grade.ts';
import { publishingReadinessForProduct } from './readiness.ts';
import type {
  CatalogPublishingReadiness,
  HealthDimensionId,
  ProductHealthSummary,
} from './types.ts';
import { canonicalIssueFamily } from './upstream.ts';

const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export interface ProductHealthEvaluation {
  readonly summary: ProductHealthSummary;
  readonly dimensionScores: Readonly<Record<HealthDimensionId, number>>;
  readonly canonicalIssueFamilies: readonly string[];
  readonly sufficientAnalysis: boolean;
}

function issueDimension(issue: IntelligenceIssue): HealthDimensionId {
  if (typeof issue.metadata.contradictionId === 'string') return 'CONSISTENCY';
  if (typeof issue.metadata.claimGroupId === 'string' || issue.category === 'PRODUCT_TRUTH') {
    return 'PRODUCT_TRUTH';
  }
  if (issue.category === 'SEO') return 'SEO';
  if (issue.category === 'MEDIA') return 'MEDIA';
  if (issue.category === 'VARIANT') return 'VARIANTS';
  if (issue.category === 'PRICING') return 'PRICING';
  if (issue.category === 'SPECIFICATION') return 'SPECIFICATIONS';
  if (issue.category === 'CATALOG_HEALTH') return 'CATALOG_INTEGRITY';
  const identity = `${issue.code} ${issue.affectedFields.join(' ')}`.toLowerCase();
  if (/(identity|sku|barcode|handle|vendor|producttype|product_type|title)/.test(identity)) {
    return 'IDENTITY';
  }
  return 'DATA_COMPLETENESS';
}

export function dimensionForRecommendation(
  recommendation: Recommendation,
): HealthDimensionId {
  switch (recommendation.category) {
    case 'PRODUCT_TRUTH': return 'PRODUCT_TRUTH';
    case 'CONTRADICTION': return 'CONSISTENCY';
    case 'SEO': return 'SEO';
    case 'MEDIA': return 'MEDIA';
    case 'IDENTITY': return 'IDENTITY';
    case 'VARIANTS': return 'VARIANTS';
    case 'CATALOG': return 'CATALOG_INTEGRITY';
    case 'PUBLISHING_READINESS': return 'PUBLISHING_READINESS';
    default: return 'DATA_COMPLETENESS';
  }
}

function truthPenalty(finding: TruthFinding): number {
  switch (finding.status) {
    case 'CONFLICTED': return 24;
    case 'UNRESOLVED': return 20;
    case 'INSUFFICIENT_EVIDENCE': return 15;
    case 'LIKELY': return 4;
    default: return 0;
  }
}

function truthQualityStatus(
  findings: readonly TruthFinding[],
  hasEvidence: boolean,
): ProductHealthSummary['truthQualityStatus'] {
  if (!hasEvidence || findings.length === 0) return 'NO_EVIDENCE';
  if (findings.some(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')) return 'BLOCKED';
  if (findings.some(({ reviewRequirement }) => reviewRequirement === 'REQUIRED')) {
    return 'REVIEW_REQUIRED';
  }
  if (findings.some((finding) => (
    finding.reviewRequirement === 'OPTIONAL'
    || finding.status === 'LIKELY'
    || finding.evidenceSummary.missingProvenanceCount > 0
  ))) return 'REVIEW_RECOMMENDED';
  return 'TRUSTED';
}

function productAssessmentConfidence(input: {
  readonly hasProductTruth: boolean;
  readonly hasDetective: boolean;
  readonly hasRecommendationPlan: boolean;
  readonly hasEvidence: boolean;
  readonly truthFindings: readonly TruthFinding[];
}): number {
  const capabilities = [
    input.hasProductTruth,
    input.hasDetective,
    input.hasRecommendationPlan,
  ].filter(Boolean).length;
  const provenanceComplete = input.truthFindings.length === 0
    || input.truthFindings.every(({ evidenceSummary }) => evidenceSummary.missingProvenanceCount === 0);
  return boundedHealthScore(
    capabilities / 3 * 60
    + (input.hasEvidence ? 25 : 0)
    + (input.hasEvidence && provenanceComplete ? 15 : 0),
  );
}

function emptyDimensionScores(): Record<HealthDimensionId, number> {
  return {
    IDENTITY: 100,
    DATA_COMPLETENESS: 100,
    PRODUCT_TRUTH: 100,
    CONSISTENCY: 100,
    SEO: 100,
    MEDIA: 100,
    VARIANTS: 100,
    PRICING: 100,
    SPECIFICATIONS: 100,
    CATALOG_INTEGRITY: 100,
    PUBLISHING_READINESS: 100,
  };
}

function externalIdentity(product: NormalizedProduct): Pick<
ProductHealthSummary,
'externalId' | 'vendor' | 'productType' | 'category' | 'source' | 'productStatus'
> {
  const source = [...product.sourceReferences].sort((left, right) => (
    (left.externalId ?? '').localeCompare(right.externalId ?? '')
    || left.sourceType.localeCompare(right.sourceType)
  ))[0];
  return {
    ...(source?.externalId ? { externalId: source.externalId } : {}),
    ...(product.vendor ? { vendor: product.vendor } : {}),
    ...(product.productType ? { productType: product.productType } : {}),
    ...(product.categories[0] ? { category: [...product.categories].sort()[0] } : {}),
    ...(source ? { source: source.sourceType } : {}),
    ...(product.status ? { productStatus: product.status } : {}),
  };
}

export function evaluateProductHealth(input: {
  readonly product: NormalizedProduct;
  readonly issues: readonly IntelligenceIssue[];
  readonly truthFindings: readonly TruthFinding[];
  readonly detectiveFindings: readonly DetectiveFinding[];
  readonly recommendations: readonly Recommendation[];
  readonly quickWinIds: ReadonlySet<string>;
  readonly hasProductTruth: boolean;
  readonly hasDetective: boolean;
  readonly hasRecommendationPlan: boolean;
  readonly configuration: CatalogHealthConfiguration;
  readonly hasher: IntelligenceHasher;
}): ProductHealthEvaluation {
  const hasEvidence = input.product.evidenceIds.length > 0
    || input.truthFindings.some(({ evidenceSummary }) => evidenceSummary.evidenceCount > 0);
  const hasCompleteUpstream = input.hasProductTruth
    && input.hasDetective
    && input.hasRecommendationPlan;
  const sufficientAnalysis = hasCompleteUpstream && hasEvidence;
  const readiness = publishingReadinessForProduct({
    hasCompleteUpstream,
    hasEvidence,
    issueSeverities: input.issues.map(({ severity }) => severity),
    truthFindings: input.truthFindings,
    detectiveFindings: input.detectiveFindings,
    recommendations: input.recommendations,
    configuration: input.configuration,
  });
  const assessmentConfidence = productAssessmentConfidence({
    hasProductTruth: input.hasProductTruth,
    hasDetective: input.hasDetective,
    hasRecommendationPlan: input.hasRecommendationPlan,
    hasEvidence,
    truthFindings: input.truthFindings,
  });
  const penalties = new Map<string, {
    dimension: HealthDimensionId;
    penalty: number;
  }>();
  for (const issue of input.issues) {
    const family = canonicalIssueFamily(issue, input.configuration);
    const penalty = typeof issue.metadata.contradictionId === 'string'
      ? input.configuration.contradictionPenalties[issue.severity]
      : input.configuration.issueSeverityPenalties[issue.severity];
    const existing = penalties.get(family);
    if (!existing || penalty > existing.penalty) {
      penalties.set(family, {
        dimension: issueDimension(issue),
        penalty: Math.min(
          penalty,
          input.configuration.antiDoubleCounting.maximumPenaltyPerFamily,
        ),
      });
    }
  }
  for (const finding of input.truthFindings) {
    const family = `claimGroupId:${finding.claimGroupId}`;
    const penalty = Math.min(
      truthPenalty(finding),
      input.configuration.antiDoubleCounting.maximumPenaltyPerFamily,
    );
    if (penalty === 0) continue;
    const existing = penalties.get(family);
    if (!existing || penalty > existing.penalty) {
      penalties.set(family, { dimension: 'PRODUCT_TRUTH', penalty });
    }
  }
  const dimensionScores = emptyDimensionScores();
  for (const { dimension, penalty } of penalties.values()) {
    dimensionScores[dimension] = boundedHealthScore(dimensionScores[dimension] - penalty);
  }
  const enabledWeight = input.configuration.enabledDimensions
    .reduce((sum, dimension) => sum + input.configuration.dimensionWeights[dimension], 0);
  const weightedDimensionScore = input.configuration.enabledDimensions.reduce(
    (sum, dimension) => (
      sum + dimensionScores[dimension]
      * input.configuration.dimensionWeights[dimension] / enabledWeight
    ),
    0,
  );
  const blockerIds = new Set([
    ...input.truthFindings
      .filter(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')
      .map(({ id }) => `truth:${id}`),
    ...input.detectiveFindings
      .filter(({ reviewRequirement }) => reviewRequirement === 'BLOCKING')
      .map(({ id }) => `detective:${id}`),
    ...input.recommendations
      .filter(({ blockingStatus }) => blockingStatus === 'BLOCKER')
      .map(({ id }) => `recommendation:${id}`),
  ]);
  const score = boundedHealthScore(
    weightedDimensionScore
    - (blockerIds.size > 0 ? input.configuration.blockerPenalties.perProduct : 0)
    - (!sufficientAnalysis ? input.configuration.insufficientAnalysisPenalties.perProduct : 0),
  );
  const issueCountsBySeverity = Object.fromEntries(severities.map((severity) => [
    severity,
    input.issues.filter((issue) => issue.severity === severity).length,
  ])) as Record<IssueSeverity, number>;
  const contradictionCounts = Object.fromEntries(severities.map((severity) => [
    severity,
    input.detectiveFindings.filter(({ contradiction }) => (
      contradiction.severity === severity
    )).length,
  ])) as Record<IssueSeverity, number>;
  const affectedDimensions = [...new Set([
    ...[...penalties.values()].map(({ dimension }) => dimension),
    ...input.recommendations.map(dimensionForRecommendation),
  ])].sort();
  const priorityRecommendations = [...input.recommendations]
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  const stable = {
    productId: input.product.id,
    score,
    readiness,
    assessmentConfidence,
    issueFamilies: [...penalties.keys()].sort(),
    recommendationFingerprints: priorityRecommendations.map(({ fingerprint }) => fingerprint),
    truthFindingFingerprints: input.truthFindings
      .map(({ deterministicFingerprint }) => deterministicFingerprint)
      .sort(),
    contradictionFingerprints: input.detectiveFindings.map(({ fingerprint }) => fingerprint).sort(),
  };
  const fingerprint = input.hasher.hash(stable);
  const summary = immutableCopy({
    productId: input.product.id,
    ...externalIdentity(input.product),
    healthScore: score,
    healthGrade: gradeForHealthScore(score, input.configuration),
    healthStatus: statusForHealthScore({
      score,
      assessmentConfidence,
      blockedPercentage: readiness === 'BLOCKED' ? 100 : 0,
      configuration: input.configuration,
    }),
    publishingReadiness: readiness,
    assessmentConfidence,
    issueCountsBySeverity,
    truthQualityStatus: truthQualityStatus(input.truthFindings, hasEvidence),
    contradictionCounts,
    blockerCount: blockerIds.size,
    quickWinCount: input.recommendations.filter(({ id }) => input.quickWinIds.has(id)).length,
    recommendationCount: input.recommendations.length,
    affectedDimensions,
    topProblemIds: [],
    priorityRecommendationIds: priorityRecommendations.slice(0, 5).map(({ id }) => id),
    fingerprint,
    metadata: {
      sufficientAnalysis,
      antiDoubleCountingFamilyCount: penalties.size,
      deterministic: true,
    },
  }) as ProductHealthSummary;
  return Object.freeze({
    summary,
    dimensionScores: Object.freeze(dimensionScores),
    canonicalIssueFamilies: Object.freeze([...penalties.keys()].sort()),
    sufficientAnalysis,
  });
}

export function isPublishReady(readiness: CatalogPublishingReadiness): boolean {
  return readiness === 'READY' || readiness === 'READY_WITH_WARNINGS';
}
