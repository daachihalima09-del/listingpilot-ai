import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  RecommendationPriority,
} from '../domain/types.ts';
import { validateRecommendation } from '../domain/validation.ts';
import type {
  IntelligenceHasher,
  IntelligenceIdGenerator,
} from '../deterministic/services.ts';

export interface RecommendationStrategy {
  readonly id: string;
  readonly version: string;
  readonly priority: number;
  readonly enabled: boolean;
  recommend(
    issues: readonly IntelligenceIssue[],
    context: IntelligenceContext,
  ): readonly IntelligenceRecommendation[] | Promise<readonly IntelligenceRecommendation[]>;
}

interface StrategyRegistration {
  readonly strategy: RecommendationStrategy;
  enabled: boolean;
}

export class RecommendationStrategyRegistry {
  private readonly entries = new Map<string, StrategyRegistration>();

  register(strategy: RecommendationStrategy): void {
    if (!strategy.id.trim() || !strategy.version.trim()) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Recommendation strategies require an ID and version.');
    }
    if (this.entries.has(strategy.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Recommendation strategy is already registered.', {
        id: strategy.id,
      });
    }
    this.entries.set(strategy.id, { strategy, enabled: strategy.enabled });
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  ordered(): readonly RecommendationStrategy[] {
    return [...this.entries.values()]
      .filter(({ enabled }) => enabled)
      .map(({ strategy }) => strategy)
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  }

  snapshot(): readonly Readonly<{
    id: string;
    version: string;
    priority: number;
    enabled: boolean;
  }>[] {
    return immutableCopy(
      [...this.entries.values()]
        .sort((left, right) => left.strategy.id.localeCompare(right.strategy.id))
        .map(({ strategy, enabled }) => ({
          id: strategy.id,
          version: strategy.version,
          priority: strategy.priority,
          enabled,
        })),
    );
  }

  private require(id: string): StrategyRegistration {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Recommendation strategy is not registered.', { id });
    }
    return entry;
  }
}

const priorityRank: Readonly<Record<RecommendationPriority, number>> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

function recommendationFingerprint(
  recommendation: IntelligenceRecommendation,
  hasher: IntelligenceHasher,
): string {
  return hasher.hash({
    actionType: recommendation.actionType,
    title: recommendation.title.trim().toLocaleLowerCase(),
    affectedFields: [...new Set(recommendation.affectedFields)].sort(),
    proposedValues: [...recommendation.proposedValues]
      .sort((left, right) => left.field.localeCompare(right.field)),
  });
}

function mergeRecommendations(
  recommendations: readonly IntelligenceRecommendation[],
  hasher: IntelligenceHasher,
): readonly IntelligenceRecommendation[] {
  const groups = new Map<string, IntelligenceRecommendation[]>();
  for (const recommendation of recommendations) {
    const fingerprint = recommendationFingerprint(recommendation, hasher);
    const group = groups.get(fingerprint) ?? [];
    group.push(recommendation);
    groups.set(fingerprint, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fingerprint, group]) => {
      const canonical = [...group].sort((left, right) => (
        priorityRank[right.priority] - priorityRank[left.priority]
        || left.strategyId.localeCompare(right.strategyId)
        || left.id.localeCompare(right.id)
      ))[0];
      return {
        ...canonical,
        fingerprint,
        issueIds: [...new Set(group.flatMap(({ issueIds }) => issueIds))].sort(),
        affectedFields: [...new Set(group.flatMap(({ affectedFields }) => affectedFields))].sort(),
        proposedValues: [...new Map(
          group.flatMap(({ proposedValues }) => proposedValues)
            .map((item) => [item.field, item]),
        ).values()].sort((left, right) => left.field.localeCompare(right.field)),
        metadata: {
          ...canonical.metadata,
          originatingStrategyIds: [...new Set(group.map(({ strategyId }) => strategyId))].sort(),
        },
      };
    });
}

export class RecommendationEngine {
  private readonly registry: RecommendationStrategyRegistry;
  private readonly ids: IntelligenceIdGenerator;
  private readonly hasher: IntelligenceHasher;

  constructor(
    registry: RecommendationStrategyRegistry,
    ids: IntelligenceIdGenerator,
    hasher: IntelligenceHasher,
  ) {
    this.registry = registry;
    this.ids = ids;
    this.hasher = hasher;
  }

  async generate(
    issues: readonly IntelligenceIssue[],
    context: IntelligenceContext,
  ): Promise<readonly IntelligenceRecommendation[]> {
    const issueIds = new Set(issues.map(({ id }) => id));
    const produced: IntelligenceRecommendation[] = [];
    for (const strategy of this.registry.ordered()) {
      const recommendations = await strategy.recommend(issues, context);
      for (const recommendation of recommendations) {
        const normalized: IntelligenceRecommendation = {
          ...recommendation,
          id: recommendation.id || this.ids.nextId('recommendation'),
          fingerprint: recommendationFingerprint(recommendation, this.hasher),
          strategyId: strategy.id,
          strategyVersion: strategy.version,
        };
        validateRecommendation(normalized, issueIds);
        produced.push(normalized);
      }
    }
    const merged = mergeRecommendations(produced, this.hasher);
    for (const recommendation of merged) validateRecommendation(recommendation, issueIds);
    return immutableCopy(merged) as readonly IntelligenceRecommendation[];
  }
}

export class NoopRecommendationStrategy implements RecommendationStrategy {
  readonly id = 'noop';
  readonly version = '1.0.0';
  readonly priority = Number.MAX_SAFE_INTEGER;
  readonly enabled = true;

  recommend(): readonly IntelligenceRecommendation[] {
    return [];
  }
}
