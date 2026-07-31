import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceIssue,
  NormalizedProduct,
} from '../domain/types.ts';
import type { Recommendation } from '../recommendation-intelligence/types.ts';
import type { CatalogHealthConfiguration } from './configuration.ts';
import {
  segmentValuesForProduct,
  type ProductSegmentValue,
} from './concentration.ts';
import {
  boundedHealthScore,
  gradeForHealthScore,
  percentageOf,
  statusForHealthScore,
} from './grade.ts';
import type { ProductHealthEvaluation } from './product-health.ts';
import type { CatalogSegmentSummary } from './types.ts';
import { canonicalIssueFamily } from './upstream.ts';

interface SegmentBucket extends ProductSegmentValue {
  readonly productIds: Set<string>;
}

function topCounts(values: readonly string[], limit: number): readonly string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => (
      rightCount - leftCount || leftKey.localeCompare(rightKey)
    ))
    .slice(0, limit)
    .map(([key]) => key);
}

export function aggregateCatalogSegments(input: {
  readonly products: readonly NormalizedProduct[];
  readonly productEvaluations: readonly ProductHealthEvaluation[];
  readonly issues: readonly IntelligenceIssue[];
  readonly recommendations: readonly Recommendation[];
  readonly configuration: CatalogHealthConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly CatalogSegmentSummary[] {
  if (input.configuration.segmentPolicies.length === 0) return Object.freeze([]);
  const buckets = new Map<string, SegmentBucket>();
  const products = [...input.products].sort((left, right) => left.id.localeCompare(right.id));
  for (const product of products) {
    for (const policy of input.configuration.segmentPolicies) {
      for (const segment of segmentValuesForProduct(product, policy)) {
        const identity = `${segment.type}:${segment.key}`;
        let bucket = buckets.get(identity);
        if (!bucket) {
          if (buckets.size >= input.configuration.maximumSegments) continue;
          bucket = { ...segment, productIds: new Set() };
          buckets.set(identity, bucket);
        }
        bucket.productIds.add(product.id);
      }
    }
  }
  const evaluationsByProduct = new Map(input.productEvaluations.map((evaluation) => [
    evaluation.summary.productId,
    evaluation,
  ]));
  const issuesByProduct = new Map<string, IntelligenceIssue[]>();
  for (const issue of input.issues) {
    for (const productId of issue.affectedProductIds) {
      const values = issuesByProduct.get(productId) ?? [];
      values.push(issue);
      issuesByProduct.set(productId, values);
    }
  }
  const recommendationsByProduct = new Map<string, Recommendation[]>();
  for (const recommendation of input.recommendations) {
    for (const productId of recommendation.affectedProductIds) {
      const values = recommendationsByProduct.get(productId) ?? [];
      values.push(recommendation);
      recommendationsByProduct.set(productId, values);
    }
  }
  const summaries = [...buckets.values()]
    .filter(({ productIds }) => productIds.size >= input.configuration.minimumSegmentSize)
    .map((bucket): CatalogSegmentSummary => {
      const evaluations = [...bucket.productIds]
        .map((id) => evaluationsByProduct.get(id))
        .filter((value): value is ProductHealthEvaluation => Boolean(value));
      const productCount = evaluations.length;
      const healthScore = productCount === 0
        ? 0
        : boundedHealthScore(evaluations.reduce(
          (sum, { summary }) => sum + summary.healthScore,
          0,
        ) / productCount);
      const assessmentConfidence = productCount === 0
        ? 0
        : boundedHealthScore(evaluations.reduce(
          (sum, { summary }) => sum + summary.assessmentConfidence,
          0,
        ) / productCount);
      const blocked = evaluations.filter(
        ({ summary }) => summary.publishingReadiness === 'BLOCKED',
      ).length;
      const reviewRequired = evaluations.filter(
        ({ summary }) => summary.publishingReadiness === 'REVIEW_REQUIRED',
      ).length;
      const publishReady = evaluations.filter(({ summary }) => (
        summary.publishingReadiness === 'READY'
        || summary.publishingReadiness === 'READY_WITH_WARNINGS'
      )).length;
      const issueFamilies = [...bucket.productIds].flatMap((id) => (
        (issuesByProduct.get(id) ?? []).map((issue) => (
          canonicalIssueFamily(issue, input.configuration)
        ))
      ));
      const recommendationCategories = [...bucket.productIds].flatMap((id) => (
        (recommendationsByProduct.get(id) ?? []).map(({ category }) => category)
      ));
      const stable = {
        type: bucket.type,
        key: bucket.key,
        productFingerprints: evaluations.map(({ summary }) => summary.fingerprint).sort(),
        healthScore,
        assessmentConfidence,
      };
      return {
        segmentType: bucket.type,
        segmentKey: bucket.key,
        segmentLabel: bucket.label,
        productCount,
        healthScore,
        healthGrade: gradeForHealthScore(healthScore, input.configuration),
        healthStatus: statusForHealthScore({
          score: healthScore,
          assessmentConfidence,
          blockedPercentage: percentageOf(blocked, productCount),
          configuration: input.configuration,
        }),
        publishReadyPercentage: percentageOf(publishReady, productCount),
        blockedProductCount: blocked,
        reviewRequiredCount: reviewRequired,
        topIssueFamilies: topCounts(issueFamilies, 3),
        topRecommendationCategories: topCounts(recommendationCategories, 3),
        assessmentConfidence,
        fingerprint: input.hasher.hash(stable),
      };
    });
  return immutableCopy(summaries.sort((left, right) => (
    left.segmentType.localeCompare(right.segmentType)
    || left.segmentKey.localeCompare(right.segmentKey)
  ))) as readonly CatalogSegmentSummary[];
}
