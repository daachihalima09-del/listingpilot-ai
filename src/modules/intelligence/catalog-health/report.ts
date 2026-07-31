import type { IntelligenceHasher } from '../deterministic/services.ts';
import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  DetectorExecutionRecord,
  IntelligenceContext,
  IntelligenceIssue,
  NormalizedProduct,
} from '../domain/types.ts';
import type { Recommendation } from '../recommendation-intelligence/types.ts';
import type {
  CatalogHealthConfiguration,
} from './configuration.ts';
import {
  CATALOG_HEALTH_CAPABILITY_ID,
  CATALOG_HEALTH_VERSION,
} from './configuration.ts';
import {
  evaluateAssessmentConfidence,
  evaluateCatalogCoverage,
} from './coverage.ts';
import { evaluateHealthDimensions } from './dimensions.ts';
import { buildCatalogFocusAreas } from './focus-areas.ts';
import {
  gradeForHealthScore,
  statusForHealthScore,
} from './grade.ts';
import {
  evaluateProductHealth,
  isPublishReady,
  type ProductHealthEvaluation,
} from './product-health.ts';
import { aggregateCatalogProblems } from './problems.ts';
import { aggregatePublishingReadiness } from './readiness.ts';
import { calculateCatalogHealthScore } from './score.ts';
import { aggregateCatalogSegments } from './segments.ts';
import type {
  CatalogHealthReport,
  CatalogProblem,
  ProductHealthSummary,
} from './types.ts';
import {
  collectCatalogHealthUpstreamReports,
  recommendationsFromPlan,
  type CatalogHealthUpstreamReports,
} from './upstream.ts';

export interface CatalogHealthReportInput {
  readonly context: IntelligenceContext;
  readonly issues: readonly IntelligenceIssue[];
  readonly detectorExecutions: readonly DetectorExecutionRecord[];
  readonly recommendationPlan?: import('../recommendation-intelligence/types.ts').RecommendationPlan;
}

interface ProductIndexes {
  readonly issues: ReadonlyMap<string, readonly IntelligenceIssue[]>;
  readonly recommendations: ReadonlyMap<string, readonly Recommendation[]>;
}

function assertUniqueIds(values: readonly { readonly id: string }[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value.id.trim() || seen.has(value.id)) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        `${label} requires unique non-empty stable IDs.`,
        { id: value.id },
      );
    }
    seen.add(value.id);
  }
}

function validateUpstream(input: {
  readonly upstream: CatalogHealthUpstreamReports;
  readonly productIds: ReadonlySet<string>;
}): void {
  const truthStatuses = [
    'VERIFIED',
    'LIKELY',
    'CONFLICTED',
    'UNRESOLVED',
    'INSUFFICIENT_EVIDENCE',
    'MERCHANT_OVERRIDE',
    'NOT_APPLICABLE',
  ];
  const reviewRequirements = ['NONE', 'OPTIONAL', 'REQUIRED', 'BLOCKING'];
  const truthFindings = input.upstream.productTruth?.findings ?? [];
  assertUniqueIds(truthFindings, 'Product Truth findings');
  if (truthFindings.some((finding) => (
    !input.productIds.has(finding.productId)
    || !truthStatuses.includes(finding.status)
    || !reviewRequirements.includes(finding.reviewRequirement)
  ))) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Product Truth findings contain an unsupported status or product identity.',
    );
  }
  const detectiveFindings = input.upstream.detective?.findings ?? [];
  assertUniqueIds(detectiveFindings, 'AI Detective findings');
  assertUniqueIds(
    detectiveFindings.map(({ contradiction }) => contradiction),
    'AI Detective contradictions',
  );
  if (detectiveFindings.some((finding) => (
    !reviewRequirements.includes(finding.reviewRequirement)
    || finding.contradiction.affectedProductIds.some((id) => !input.productIds.has(id))
  ))) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'AI Detective findings contain an unsupported status or product identity.',
    );
  }
}

function appendMapValue<T>(
  map: Map<string, T[]>,
  key: string,
  value: T,
): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function productIndexes(
  products: readonly NormalizedProduct[],
  issues: readonly IntelligenceIssue[],
  recommendations: readonly Recommendation[],
): ProductIndexes {
  const productIds = new Set(products.map(({ id }) => id));
  const issuesByProduct = new Map<string, IntelligenceIssue[]>();
  for (const issue of issues) {
    for (const productId of issue.affectedProductIds) {
      if (productIds.has(productId)) appendMapValue(issuesByProduct, productId, issue);
    }
  }
  const recommendationsByProduct = new Map<string, Recommendation[]>();
  for (const recommendation of recommendations) {
    for (const productId of recommendation.affectedProductIds) {
      if (productIds.has(productId)) {
        appendMapValue(recommendationsByProduct, productId, recommendation);
      }
    }
  }
  return {
    issues: issuesByProduct,
    recommendations: recommendationsByProduct,
  };
}

function stableCatalogProduct(product: NormalizedProduct): unknown {
  return {
    id: product.id,
    externalIds: product.sourceReferences
      .map(({ sourceType, externalId, externalParentId }) => ({
        sourceType,
        externalId: externalId ?? null,
        externalParentId: externalParentId ?? null,
      }))
      .sort((left, right) => (
        left.sourceType.localeCompare(right.sourceType)
        || String(left.externalId).localeCompare(String(right.externalId))
      )),
    title: product.title,
    description: product.description ?? null,
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    categories: [...product.categories].sort(),
    tags: [...product.tags].sort(),
    status: product.status ?? null,
    specifications: [...product.specifications]
      .map(({ key, normalizedValue, unit, valueType }) => ({
        key,
        normalizedValue: normalizedValue ?? null,
        unit: unit ?? null,
        valueType,
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    variantIds: product.variants.map(({ id }) => id).sort(),
    mediaIds: product.media.map(({ id }) => id).sort(),
    seo: product.seo,
  };
}

function attachProductProblems(input: {
  readonly evaluations: readonly ProductHealthEvaluation[];
  readonly problems: readonly CatalogProblem[];
  readonly issues: readonly IntelligenceIssue[];
  readonly recommendations: readonly Recommendation[];
  readonly upstream: CatalogHealthUpstreamReports;
  readonly hasher: IntelligenceHasher;
}): readonly ProductHealthEvaluation[] {
  const issueById = new Map(input.issues.map((issue) => [issue.id, issue]));
  const recommendationById = new Map(input.recommendations.map((recommendation) => [
    recommendation.id,
    recommendation,
  ]));
  const contradictionById = new Map(
    (input.upstream.detective?.findings ?? []).map(({ contradiction }) => [
      contradiction.id,
      contradiction,
    ]),
  );
  const productIdsByProblem = new Map<string, Set<string>>();
  for (const problem of input.problems) {
    const productIds = new Set<string>();
    for (const issueId of problem.relatedIssueIds) {
      for (const productId of issueById.get(issueId)?.affectedProductIds ?? []) {
        productIds.add(productId);
      }
    }
    for (const recommendationId of problem.relatedRecommendationIds) {
      for (const productId of recommendationById.get(recommendationId)?.affectedProductIds ?? []) {
        productIds.add(productId);
      }
    }
    for (const contradictionId of problem.relatedContradictionIds) {
      for (const productId of contradictionById.get(contradictionId)?.affectedProductIds ?? []) {
        productIds.add(productId);
      }
    }
    productIdsByProblem.set(problem.problemId, productIds);
  }
  return input.evaluations.map((evaluation) => {
    const topProblemIds = input.problems
      .filter(({ problemId }) => (
        productIdsByProblem.get(problemId)?.has(evaluation.summary.productId)
      ))
      .slice(0, 5)
      .map(({ problemId }) => problemId);
    const summary = immutableCopy({
      ...evaluation.summary,
      topProblemIds,
      fingerprint: input.hasher.hash({
        baseFingerprint: evaluation.summary.fingerprint,
        topProblemIds,
      }),
    }) as ProductHealthSummary;
    return Object.freeze({ ...evaluation, summary });
  });
}

export class CatalogHealthReportBuilder {
  private readonly configuration: CatalogHealthConfiguration;
  private readonly hasher: IntelligenceHasher;

  constructor(input: {
    readonly configuration: CatalogHealthConfiguration;
    readonly hasher: IntelligenceHasher;
  }) {
    this.configuration = input.configuration;
    this.hasher = input.hasher;
  }

  build(input: CatalogHealthReportInput): CatalogHealthReport {
    assertUniqueIds(input.context.products, 'Catalog products');
    assertUniqueIds(input.issues, 'Intelligence issues');
    const upstream = collectCatalogHealthUpstreamReports({
      detectorExecutions: input.detectorExecutions,
      recommendationPlan: input.recommendationPlan,
    });
    const productIds = new Set(input.context.products.map(({ id }) => id));
    validateUpstream({ upstream, productIds });
    const recommendations = recommendationsFromPlan(upstream.recommendationPlan);
    if (recommendations.some(({ affectedProductIds }) => (
      affectedProductIds.some((id) => !productIds.has(id))
    ))) {
      throw new IntelligenceDomainError(
        'INVALID_CONTEXT',
        'Recommendation Plan contains an unknown product identity.',
      );
    }
    const indexes = productIndexes(input.context.products, input.issues, recommendations);
    const coverage = evaluateCatalogCoverage({
      context: input.context,
      detectorExecutions: input.detectorExecutions,
      upstream,
      hasher: this.hasher,
    });
    const assessmentConfidence = evaluateAssessmentConfidence({
      coverage,
      totalProducts: input.context.products.length,
      configuration: this.configuration,
    });
    const truthByProduct = new Map<string, NonNullable<
    CatalogHealthUpstreamReports['productTruth']
    >['findings']>();
    for (const finding of upstream.productTruth?.findings ?? []) {
      appendMapValue(
        truthByProduct as Map<string, typeof finding[]>,
        finding.productId,
        finding,
      );
    }
    const detectiveByProduct = new Map<string, NonNullable<
    CatalogHealthUpstreamReports['detective']
    >['findings']>();
    for (const finding of upstream.detective?.findings ?? []) {
      for (const productId of finding.contradiction.affectedProductIds) {
        appendMapValue(
          detectiveByProduct as Map<string, typeof finding[]>,
          productId,
          finding,
        );
      }
    }
    const quickWinIds = new Set(upstream.recommendationPlan?.quickWins.map(({ id }) => id));
    let evaluations: readonly ProductHealthEvaluation[] = [...input.context.products]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((product) => evaluateProductHealth({
        product,
        issues: indexes.issues.get(product.id) ?? [],
        truthFindings: truthByProduct.get(product.id) ?? [],
        detectiveFindings: detectiveByProduct.get(product.id) ?? [],
        recommendations: indexes.recommendations.get(product.id) ?? [],
        quickWinIds,
        hasProductTruth: Boolean(upstream.productTruth),
        hasDetective: Boolean(upstream.detective),
        hasRecommendationPlan: Boolean(upstream.recommendationPlan),
        configuration: this.configuration,
        hasher: this.hasher,
      }));
    const allDetectiveFindings = upstream.detective?.findings ?? [];
    const problems = aggregateCatalogProblems({
      products: input.context.products,
      issues: input.issues,
      detectiveFindings: allDetectiveFindings,
      recommendations,
      assessmentConfidence,
      configuration: this.configuration,
      hasher: this.hasher,
    });
    evaluations = attachProductProblems({
      evaluations,
      problems,
      issues: input.issues,
      recommendations,
      upstream,
      hasher: this.hasher,
    });
    const dimensions = evaluateHealthDimensions({
      productEvaluations: evaluations,
      issues: input.issues,
      recommendations,
      assessmentConfidence,
      configuration: this.configuration,
      hasher: this.hasher,
    });
    const segments = aggregateCatalogSegments({
      products: input.context.products,
      productEvaluations: evaluations,
      issues: input.issues,
      recommendations,
      configuration: this.configuration,
      hasher: this.hasher,
    });
    const focusAreas = buildCatalogFocusAreas({
      plan: upstream.recommendationPlan,
      problems,
      configuration: this.configuration,
      hasher: this.hasher,
    });
    const productSummaries = evaluations.map(({ summary }) => summary);
    const readiness = aggregatePublishingReadiness(
      productSummaries.map(({ publishingReadiness }) => publishingReadiness),
    );
    const scoreExplanation = calculateCatalogHealthScore({
      dimensions,
      products: productSummaries,
      configuration: this.configuration,
    });
    const catalogFingerprint = this.hasher.hash({
      catalogId: input.context.catalogId,
      products: [...input.context.products]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(stableCatalogProduct),
      issueFingerprints: input.issues.map(({ fingerprint }) => fingerprint).sort(),
      productTruthFingerprint: upstream.productTruth?.deterministicFingerprint ?? null,
      detectiveFingerprint: upstream.detective?.fingerprint ?? null,
      recommendationPlanFingerprint: upstream.recommendationPlan?.fingerprint ?? null,
    });
    const blockedProductCount = readiness.counts.BLOCKED;
    const status = coverage.missingCapabilities.length > 0
      ? 'INSUFFICIENT_ANALYSIS'
      : statusForHealthScore({
        score: scoreExplanation.finalScore,
        assessmentConfidence,
        blockedPercentage: readiness.blockedPercentage,
        configuration: this.configuration,
      });
    const stable = {
      capabilityId: CATALOG_HEALTH_CAPABILITY_ID,
      capabilityVersion: CATALOG_HEALTH_VERSION,
      catalogFingerprint,
      productFingerprints: productSummaries.map(({ fingerprint }) => fingerprint),
      dimensionFingerprints: dimensions.map(({ fingerprint }) => fingerprint),
      segmentFingerprints: segments.map(({ fingerprint }) => fingerprint),
      problemFingerprints: problems.map(({ fingerprint }) => fingerprint),
      focusAreaFingerprints: focusAreas.map(({ fingerprint }) => fingerprint),
      coverageFingerprint: coverage.fingerprint,
      scoreExplanation,
      assessmentConfidence,
      status,
    };
    const fingerprint = this.hasher.hash(stable);
    const sufficient = evaluations.filter(({ sufficientAnalysis }) => sufficientAnalysis).length;
    const report: CatalogHealthReport = {
      reportId: `catalog_health_${fingerprint}`,
      schemaVersion: CATALOG_HEALTH_VERSION,
      capabilityId: CATALOG_HEALTH_CAPABILITY_ID,
      capabilityVersion: CATALOG_HEALTH_VERSION,
      catalogFingerprint,
      productsAnalyzed: productSummaries.length,
      productsWithSufficientAnalysis: sufficient,
      productsWithIncompleteAnalysis: productSummaries.length - sufficient,
      overallHealthScore: scoreExplanation.finalScore,
      overallHealthGrade: gradeForHealthScore(scoreExplanation.finalScore, this.configuration),
      overallHealthStatus: status,
      assessmentConfidence,
      publishReadyProductCount: productSummaries.filter(
        ({ publishingReadiness }) => isPublishReady(publishingReadiness),
      ).length,
      reviewRecommendedProductCount: readiness.counts.REVIEW_RECOMMENDED,
      reviewRequiredProductCount: readiness.counts.REVIEW_REQUIRED,
      blockedProductCount,
      trustedProductCount: productSummaries.filter(
        ({ truthQualityStatus }) => truthQualityStatus === 'TRUSTED',
      ).length,
      productsWithoutEvidence: productSummaries.length - coverage.productsWithSufficientEvidence,
      healthDimensions: dimensions,
      productHealthSummaries: productSummaries,
      segmentSummaries: segments,
      topProblems: problems,
      priorityFocusAreas: focusAreas,
      recommendationSummary: {
        totalRecommendations: upstream.recommendationPlan?.totalRecommendations ?? 0,
        blockerCount: upstream.recommendationPlan?.blockers.length ?? 0,
        quickWinCount: upstream.recommendationPlan?.quickWins.length ?? 0,
        focusAreaCount: focusAreas.length,
        highestPriority: upstream.recommendationPlan?.highestPriority ?? null,
      },
      readinessSummary: readiness,
      coverageSummary: coverage,
      scoreExplanation,
      fingerprint,
      generatedAt: input.context.execution.requestedAt,
      metadata: {
        deterministic: true,
        configurationFingerprint: this.hasher.hash(this.configuration),
        missingCapabilities: [...coverage.missingCapabilities],
        expectedComplexity: 'O(products + issues + findings + contradictions + recommendations)',
        persistence: false,
      },
    };
    return immutableCopy(report) as CatalogHealthReport;
  }
}
