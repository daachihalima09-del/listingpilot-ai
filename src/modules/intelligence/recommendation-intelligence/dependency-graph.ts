import { IntelligenceDomainError } from '../domain/errors.ts';
import type { RecommendationCategory } from './types.ts';

export interface RecommendationDependencyNode {
  readonly id: string;
  readonly category: RecommendationCategory;
  readonly affectedProductIds: readonly string[];
  readonly prerequisiteCategories: readonly RecommendationCategory[];
  readonly blocker: boolean;
  readonly prioritySeed: number;
}

export interface RecommendationDependencyGraph {
  readonly dependenciesByRecommendationId: ReadonlyMap<string, readonly string[]>;
  readonly dependentCounts: ReadonlyMap<string, number>;
}

function anchorKeys(node: RecommendationDependencyNode): readonly string[] {
  return node.affectedProductIds.length > 0
    ? [...new Set(node.affectedProductIds)].sort()
    : ['*'];
}

function betterAnchor(
  left: RecommendationDependencyNode,
  right: RecommendationDependencyNode,
): RecommendationDependencyNode {
  if (left.blocker !== right.blocker) return left.blocker ? left : right;
  if (left.prioritySeed !== right.prioritySeed) {
    return left.prioritySeed > right.prioritySeed ? left : right;
  }
  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

export function buildRecommendationDependencyGraph(
  nodes: readonly RecommendationDependencyNode[],
): RecommendationDependencyGraph {
  const anchors = new Map<string, RecommendationDependencyNode>();
  for (const node of nodes) {
    for (const productId of anchorKeys(node)) {
      const key = `${node.category}\u0000${productId}`;
      const existing = anchors.get(key);
      anchors.set(key, existing ? betterAnchor(existing, node) : node);
    }
    if (node.affectedProductIds.length !== 1) {
      const globalKey = `${node.category}\u0000*`;
      const global = anchors.get(globalKey);
      anchors.set(globalKey, global ? betterAnchor(global, node) : node);
    }
  }
  const dependencies = new Map<string, readonly string[]>();
  const dependentCounts = new Map(nodes.map(({ id }) => [id, 0]));
  for (const node of nodes) {
    const selected = new Set<string>();
    for (const category of node.prerequisiteCategories) {
      for (const productId of anchorKeys(node)) {
        const anchor = anchors.get(`${category}\u0000${productId}`)
          ?? anchors.get(`${category}\u0000*`);
        if (anchor && anchor.id !== node.id) selected.add(anchor.id);
      }
    }
    const ordered = [...selected].sort();
    dependencies.set(node.id, ordered);
    for (const dependencyId of ordered) {
      dependentCounts.set(dependencyId, (dependentCounts.get(dependencyId) ?? 0) + 1);
    }
  }
  return {
    dependenciesByRecommendationId: dependencies,
    dependentCounts,
  };
}

export function topologicalRecommendationOrder(input: {
  readonly recommendationIds: readonly string[];
  readonly dependenciesByRecommendationId: ReadonlyMap<string, readonly string[]>;
  readonly compare: (leftId: string, rightId: string) => number;
}): readonly string[] {
  const ids = [...new Set(input.recommendationIds)];
  const known = new Set(ids);
  const inDegree = new Map(ids.map((id) => [
    id,
    (input.dependenciesByRecommendationId.get(id) ?? []).filter((dependency) => known.has(dependency)).length,
  ]));
  const dependents = new Map<string, string[]>();
  for (const id of ids) {
    for (const dependency of input.dependenciesByRecommendationId.get(id) ?? []) {
      if (!known.has(dependency)) continue;
      const group = dependents.get(dependency) ?? [];
      group.push(id);
      dependents.set(dependency, group);
    }
  }
  const ready = ids.filter((id) => inDegree.get(id) === 0).sort(input.compare);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordered.push(id);
    for (const dependent of (dependents.get(id) ?? []).sort(input.compare)) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort(input.compare);
      }
    }
  }
  if (ordered.length !== ids.length) {
    throw new IntelligenceDomainError(
      'INVALID_CONTEXT',
      'Recommendation dependency graph contains a cycle.',
    );
  }
  return ordered;
}
