import type { IntelligenceHasher } from '../deterministic/services.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type { RecommendationIntelligenceConfiguration } from './configuration.ts';
import { aggregateEffort, aggregateImpact } from './impact-effort.ts';
import type {
  Recommendation,
  RecommendationCategory,
  RecommendationGroup,
} from './types.ts';

export function groupRecommendations(input: {
  readonly recommendations: readonly Recommendation[];
  readonly executionOrder: readonly string[];
  readonly configuration: RecommendationIntelligenceConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly RecommendationGroup[] {
  const executionIndex = new Map(input.executionOrder.map((id, index) => [id, index]));
  const categoryById = new Map(input.recommendations.map(({ id, category }) => [id, category]));
  const groups = new Map<RecommendationCategory, Recommendation[]>();
  for (const recommendation of input.recommendations) {
    const group = groups.get(recommendation.category) ?? [];
    group.push(recommendation);
    groups.set(recommendation.category, group);
  }
  return immutableCopy([...groups.entries()]
    .sort(([left], [right]) => (
      input.configuration.groupingPolicies[left].order
      - input.configuration.groupingPolicies[right].order
      || left.localeCompare(right)
    ))
    .map(([category, recommendations]): RecommendationGroup => {
      const policy = input.configuration.groupingPolicies[category];
      const ordered = [...recommendations].sort((left, right) => (
        (executionIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER)
        - (executionIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER)
        || left.id.localeCompare(right.id)
      ));
      const recommendationIds = new Set(ordered.map(({ id }) => id));
      const completionDependencies = [...new Set(ordered.flatMap(({ dependencies }) => (
        dependencies.filter((id) => !recommendationIds.has(id)
          && categoryById.get(id) !== category)
      )))].sort();
      const fingerprint = input.hasher.hash({
        policyId: policy.id,
        category,
        recommendationFingerprints: ordered.map(({ fingerprint: value }) => value),
        completionDependencies,
      });
      return {
        id: `recommendation_group_${input.hasher.hash({ policyId: policy.id, category })}`,
        name: policy.name,
        description: policy.description,
        category,
        recommendations: ordered,
        estimatedEffort: aggregateEffort(ordered.map(({ estimatedEffort }) => estimatedEffort)),
        estimatedImpact: aggregateImpact(ordered.map(({ estimatedImpact }) => estimatedImpact)),
        completionDependencies,
        fingerprint,
      };
    })) as readonly RecommendationGroup[];
}
