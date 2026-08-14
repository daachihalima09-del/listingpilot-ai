import { immutableCopy } from '../../intelligence/domain/immutability.ts';
import {
  PRODUCT_INTELLIGENCE_DETECTOR_VERSION,
  UNKNOWN_PRODUCT_CATEGORY,
  type CategoryDetectionCandidate,
  type CategoryDetectionConfidence,
  type CategoryDetectionEvidence,
  type CategoryDetectionInput,
  type CategoryDetectionResult,
  type CategoryDetectionRule,
  type CategoryDetectionSource,
  type ProductIntelligencePack,
} from '../domain/contracts.ts';
import type { ProductIntelligenceRegistry } from '../registry/product-intelligence-registry.ts';
import { normalizeProductIntelligenceTerm } from '../registry/pack-validation.ts';

const sourceOrder: Readonly<Record<CategoryDetectionSource, number>> = {
  normalizedCategory: 1,
  shopifyTaxonomyCategory: 2,
  productType: 3,
  category: 4,
  title: 5,
  description: 6,
  tag: 7,
  collection: 8,
  brand: 9,
  vendor: 10,
  model: 11,
};

function sourceValues(input: CategoryDetectionInput, source: CategoryDetectionSource): readonly string[] {
  const values: Partial<Record<CategoryDetectionSource, readonly string[]>> = {
    normalizedCategory: input.normalizedCategory ? [input.normalizedCategory] : [],
    shopifyTaxonomyCategory: input.shopifyTaxonomyCategory ? [input.shopifyTaxonomyCategory] : [],
    productType: input.productType ? [input.productType] : [],
    category: input.categories ?? [],
    title: input.title ? [input.title] : [],
    description: input.description ? [input.description] : [],
    tag: input.tags ?? [],
    collection: input.collections ?? [],
    brand: input.brand ? [input.brand] : [],
    vendor: input.vendor ? [input.vendor] : [],
    model: input.model ? [input.model] : [],
  };
  return values[source] ?? [];
}

function termMatches(rule: CategoryDetectionRule, value: string, term: string): boolean {
  const normalizedValue = normalizeProductIntelligenceTerm(value);
  const normalizedTerm = normalizeProductIntelligenceTerm(term);
  if (!normalizedValue || !normalizedTerm) return false;
  if (rule.match === 'EXACT') return normalizedValue === normalizedTerm;
  if (rule.match === 'ALL_TERMS') {
    return normalizedTerm.split(' ').every((token) => (` ${normalizedValue} `).includes(` ${token} `));
  }
  return (` ${normalizedValue} `).includes(` ${normalizedTerm} `);
}

function evidenceForRule(pack: ProductIntelligencePack, rule: CategoryDetectionRule, input: CategoryDetectionInput): readonly CategoryDetectionEvidence[] {
  const evidence: CategoryDetectionEvidence[] = [];
  for (const source of rule.sources) {
    const values = [...sourceValues(input, source)].sort((left, right) => left.localeCompare(right, 'en-US'));
    for (const value of values) {
      const matchedTerm = [...rule.terms]
        .sort((left, right) => right.length - left.length || left.localeCompare(right, 'en-US'))
        .find((term) => termMatches(rule, value, term));
      if (!matchedTerm) continue;
      evidence.push({
        packId: pack.identity.id,
        category: pack.identity.categoryId,
        source,
        value: value.slice(0, 160),
        ruleId: rule.id,
        ruleVersion: rule.version,
        weight: rule.weight,
        polarity: rule.polarity,
      });
      break;
    }
  }
  return evidence;
}

function orderEvidence(values: readonly CategoryDetectionEvidence[]): readonly CategoryDetectionEvidence[] {
  return [...values].sort((left, right) => (
    right.weight - left.weight
    || sourceOrder[left.source] - sourceOrder[right.source]
    || left.ruleId.localeCompare(right.ruleId)
    || left.value.localeCompare(right.value, 'en-US')
  ));
}

function confidence(pack: ProductIntelligencePack, score: number): CategoryDetectionConfidence {
  if (score >= pack.detection.highConfidenceScore) return 'HIGH';
  if (score >= pack.detection.mediumConfidenceScore) return 'MEDIUM';
  return 'LOW';
}

interface EvaluatedCandidate extends CategoryDetectionCandidate {
  readonly pack: ProductIntelligencePack;
  readonly evidence: readonly CategoryDetectionEvidence[];
  readonly negativeEvidence: readonly CategoryDetectionEvidence[];
  readonly decisive: boolean;
  readonly blocked: boolean;
  readonly ambiguitySignal: boolean;
}

function evaluateCandidate(pack: ProductIntelligencePack, input: CategoryDetectionInput): EvaluatedCandidate {
  const matched = pack.detection.rules.flatMap((rule) => evidenceForRule(pack, rule, input).map((evidence) => ({ rule, evidence })));
  const positive = orderEvidence(matched.filter(({ rule }) => rule.polarity === 'POSITIVE').map(({ evidence }) => evidence));
  const negative = orderEvidence(matched.filter(({ rule }) => rule.polarity === 'NEGATIVE').map(({ evidence }) => evidence));
  const positiveScore = positive.reduce((sum, item) => sum + item.weight, 0);
  const penaltyScore = matched.filter(({ rule }) => rule.polarity === 'NEGATIVE' && rule.negativeOutcome === 'PENALIZE')
    .reduce((sum, { evidence }) => sum + evidence.weight, 0);
  const blockScore = matched.filter(({ rule }) => rule.polarity === 'NEGATIVE' && rule.negativeOutcome === 'BLOCK')
    .reduce((sum, { evidence }) => sum + evidence.weight, 0);
  const score = Math.max(0, Math.min(1_000, positiveScore - penaltyScore));
  return {
    category: pack.identity.categoryId,
    packId: pack.identity.id,
    packVersion: pack.identity.version,
    score,
    confidence: confidence(pack, score),
    pack,
    evidence: positive,
    negativeEvidence: negative,
    decisive: matched.some(({ rule }) => rule.polarity === 'POSITIVE' && rule.decisive),
    blocked: blockScore >= pack.detection.negativeBlockScore,
    ambiguitySignal: matched.some(({ rule }) => rule.polarity === 'NEGATIVE' && rule.negativeOutcome === 'AMBIGUATE'),
  };
}

function publicCandidate(candidate: EvaluatedCandidate): CategoryDetectionCandidate {
  return {
    category: candidate.category,
    packId: candidate.packId,
    packVersion: candidate.packVersion,
    score: candidate.score,
    confidence: candidate.confidence,
  };
}

function fallback(candidates: readonly EvaluatedCandidate[], status: 'UNKNOWN' | 'AMBIGUOUS'): CategoryDetectionResult {
  const evidence = orderEvidence(candidates.flatMap((candidate) => candidate.evidence));
  const negativeEvidence = orderEvidence(candidates.flatMap((candidate) => candidate.negativeEvidence));
  return immutableCopy({
    category: UNKNOWN_PRODUCT_CATEGORY,
    matchedPackId: null,
    matchedPackVersion: null,
    confidence: 'LOW',
    score: candidates[0]?.score ?? 0,
    evidence: status === 'AMBIGUOUS' ? evidence : [],
    negativeEvidence,
    competingCandidates: candidates.filter(({ score, decisive }) => score > 0 && decisive).map(publicCandidate),
    detectorVersion: PRODUCT_INTELLIGENCE_DETECTOR_VERSION,
    status,
  }) as CategoryDetectionResult;
}

export function detectProductCategory(
  input: CategoryDetectionInput,
  registry: ProductIntelligenceRegistry,
): CategoryDetectionResult {
  const candidates = registry.list().map((pack) => evaluateCandidate(pack, input))
    .sort((left, right) => right.score - left.score || left.packId.localeCompare(right.packId));
  const eligible = candidates.filter((candidate) => candidate.decisive && !candidate.blocked && candidate.score >= candidate.pack.detection.minimumMatchScore);
  const top = eligible[0];
  if (!top) return fallback(candidates, 'UNKNOWN');
  if (top.ambiguitySignal) return fallback([top, ...eligible.slice(1)], 'AMBIGUOUS');
  const runnerUp = eligible[1];
  if (runnerUp && top.score - runnerUp.score <= Math.max(top.pack.detection.ambiguityMargin, runnerUp.pack.detection.ambiguityMargin)) {
    return fallback([top, runnerUp], 'AMBIGUOUS');
  }
  return immutableCopy({
    category: top.category,
    matchedPackId: top.packId,
    matchedPackVersion: top.packVersion,
    confidence: top.confidence,
    score: top.score,
    evidence: top.evidence,
    negativeEvidence: top.negativeEvidence,
    competingCandidates: runnerUp ? [publicCandidate(runnerUp)] : [],
    detectorVersion: PRODUCT_INTELLIGENCE_DETECTOR_VERSION,
    status: 'MATCHED',
  }) as CategoryDetectionResult;
}
