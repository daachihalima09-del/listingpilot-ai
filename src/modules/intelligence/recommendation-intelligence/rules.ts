import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  ExtensionMetadata,
  IssueCategory,
  IssueSeverity,
} from '../domain/types.ts';
import {
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_INTELLIGENCE_VERSION,
} from './configuration.ts';
import type {
  MerchantEffort,
  RecommendationCategory,
  RecommendationImpact,
} from './types.ts';

export interface RecommendationRuleMatch {
  readonly issueCategories?: readonly IssueCategory[];
  readonly issueCodePrefixes?: readonly string[];
  readonly ruleIdPrefixes?: readonly string[];
  readonly detectorIdPrefixes?: readonly string[];
  readonly severities?: readonly IssueSeverity[];
}

export interface RecommendationRuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly category: RecommendationCategory;
  readonly enabled: boolean;
  readonly deterministic: boolean;
  readonly match: RecommendationRuleMatch;
  readonly priorityPolicy: {
    readonly baseScore: number;
    readonly blockingBonus: number;
    readonly confidenceWeight: number;
    readonly businessImportanceWeight: number;
    readonly unlockBonusMaximum: number;
  };
  readonly impactPolicy: Readonly<Record<IssueSeverity, RecommendationImpact>>;
  readonly effortPolicy: {
    readonly defaultEffort: MerchantEffort;
  };
  readonly blockingPolicy: {
    readonly alwaysBlocker: boolean;
  };
  readonly dependsOnCategories: readonly RecommendationCategory[];
  readonly titleTemplate: string;
  readonly explanationTemplate: string;
  readonly metadata: ExtensionMetadata;
}

interface Registration {
  readonly rule: RecommendationRuleDefinition;
  enabled: boolean;
}

const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const impacts: readonly RecommendationImpact[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const efforts: readonly MerchantEffort[] = ['TRIVIAL', 'SMALL', 'MEDIUM', 'LARGE'];
const issueCategories: readonly IssueCategory[] = [
  'PRODUCT_TRUTH',
  'DATA_QUALITY',
  'CATALOG_HEALTH',
  'SEO',
  'SPECIFICATION',
  'MEDIA',
  'VARIANT',
  'PRICING',
  'OTHER',
];

function matchesPrefix(value: string, prefixes: readonly string[] | undefined): boolean {
  return !prefixes || prefixes.some((prefix) => value.startsWith(prefix));
}

function validPrefixes(values: readonly string[] | undefined): boolean {
  return !values || (values.length > 0 && values.every((value) => Boolean(value.trim())));
}

export class RecommendationRuleRegistry {
  private readonly entries = new Map<string, Registration>();

  register(rule: RecommendationRuleDefinition): void {
    if (!rule.id.trim() || !rule.version.trim() || !rule.description.trim()
      || !rule.titleTemplate.trim() || !rule.explanationTemplate.trim()
      || !rule.deterministic || !Number.isFinite(rule.priorityPolicy.baseScore)
      || !Number.isFinite(rule.priorityPolicy.blockingBonus)
      || !Number.isFinite(rule.priorityPolicy.confidenceWeight)
      || !Number.isFinite(rule.priorityPolicy.businessImportanceWeight)
      || !Number.isFinite(rule.priorityPolicy.unlockBonusMaximum)
      || !RECOMMENDATION_CATEGORIES.includes(rule.category)
      || !efforts.includes(rule.effortPolicy.defaultEffort)
      || rule.dependsOnCategories.some((category) => !RECOMMENDATION_CATEGORIES.includes(category))
      || severities.some((severity) => !impacts.includes(rule.impactPolicy[severity]))
      || !validPrefixes(rule.match.issueCodePrefixes)
      || !validPrefixes(rule.match.ruleIdPrefixes)
      || !validPrefixes(rule.match.detectorIdPrefixes)
      || rule.match.issueCategories?.some((category) => !issueCategories.includes(category))
      || rule.match.severities?.some((severity) => !severities.includes(severity))) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Recommendation rule metadata is invalid.');
    }
    if (this.entries.has(rule.id)) {
      throw new IntelligenceDomainError(
        'DUPLICATE_REGISTRY_ENTRY',
        'Recommendation rule ID is already registered.',
        { id: rule.id },
      );
    }
    this.entries.set(rule.id, {
      rule: immutableCopy(rule) as RecommendationRuleDefinition,
      enabled: rule.enabled,
    });
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  get(id: string): RecommendationRuleDefinition | undefined {
    return this.entries.get(id)?.rule;
  }

  ordered(): readonly RecommendationRuleDefinition[] {
    return [...this.entries.values()]
      .filter(({ enabled }) => enabled)
      .map(({ rule }) => rule)
      .sort((left, right) => (
        Number(left.metadata.matchOrder ?? Number.MAX_SAFE_INTEGER)
        - Number(right.metadata.matchOrder ?? Number.MAX_SAFE_INTEGER)
        || left.id.localeCompare(right.id)
      ));
  }

  match(input: {
    readonly issueCategory: IssueCategory;
    readonly issueCode: string;
    readonly ruleId: string;
    readonly detectorId: string;
    readonly severity: IssueSeverity;
  }): RecommendationRuleDefinition | undefined {
    return this.ordered().find(({ match }) => (
      (!match.issueCategories || match.issueCategories.includes(input.issueCategory))
      && matchesPrefix(input.issueCode, match.issueCodePrefixes)
      && matchesPrefix(input.ruleId, match.ruleIdPrefixes)
      && matchesPrefix(input.detectorId, match.detectorIdPrefixes)
      && (!match.severities || match.severities.includes(input.severity))
    ));
  }

  snapshot(): readonly Readonly<{
    id: string;
    version: string;
    category: RecommendationCategory;
    enabled: boolean;
  }>[] {
    return immutableCopy([...this.entries.values()]
      .sort((left, right) => left.rule.id.localeCompare(right.rule.id))
      .map(({ rule, enabled }) => ({
        id: rule.id,
        version: rule.version,
        category: rule.category,
        enabled,
      })));
  }

  private require(id: string): Registration {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Recommendation rule is not registered.', { id });
    }
    return entry;
  }
}

const defaultImpact: Readonly<Record<IssueSeverity, RecommendationImpact>> = {
  INFO: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
};

function definition(input: {
  id: string;
  description: string;
  category: RecommendationCategory;
  match: RecommendationRuleMatch;
  order: number;
  baseScore: number;
  defaultEffort: MerchantEffort;
  alwaysBlocker?: boolean;
  dependsOnCategories?: readonly RecommendationCategory[];
}): RecommendationRuleDefinition {
  return {
    id: input.id,
    version: RECOMMENDATION_INTELLIGENCE_VERSION,
    description: input.description,
    category: input.category,
    enabled: true,
    deterministic: true,
    match: input.match,
    priorityPolicy: {
      baseScore: input.baseScore,
      blockingBonus: 30,
      confidenceWeight: 10,
      businessImportanceWeight: 20,
      unlockBonusMaximum: 20,
    },
    impactPolicy: defaultImpact,
    effortPolicy: { defaultEffort: input.defaultEffort },
    blockingPolicy: { alwaysBlocker: input.alwaysBlocker ?? false },
    dependsOnCategories: input.dependsOnCategories ?? [],
    titleTemplate: '{sourceTitle}',
    explanationTemplate: '{sourceExplanation}',
    metadata: { matchOrder: input.order },
  };
}

export const DEFAULT_RECOMMENDATION_RULE_DEFINITIONS: readonly RecommendationRuleDefinition[] = Object.freeze([
  definition({
    id: 'recommendation.contradiction',
    description: 'Plans resolution of AI Detective contradictions.',
    category: 'CONTRADICTION',
    match: { detectorIdPrefixes: ['ai-detective.'] },
    order: 10,
    baseScore: 78,
    defaultEffort: 'MEDIUM',
  }),
  definition({
    id: 'recommendation.product-truth',
    description: 'Plans review of Product Truth findings.',
    category: 'PRODUCT_TRUTH',
    match: { detectorIdPrefixes: ['product-truth.'] },
    order: 20,
    baseScore: 76,
    defaultEffort: 'MEDIUM',
  }),
  definition({
    id: 'recommendation.publishing-readiness',
    description: 'Plans critical readiness corrections before dependent improvements.',
    category: 'PUBLISHING_READINESS',
    match: { severities: ['CRITICAL'] },
    order: 30,
    baseScore: 90,
    defaultEffort: 'SMALL',
    alwaysBlocker: true,
  }),
  definition({
    id: 'recommendation.identity',
    description: 'Plans corrections to product and variant identities.',
    category: 'IDENTITY',
    match: {
      ruleIdPrefixes: [
        'product.title.',
        'product.vendor.',
        'product.type.',
        'product.status.',
        'variant.sku.',
        'variant.barcode.',
        'variant.id.',
      ],
    },
    order: 40,
    baseScore: 72,
    defaultEffort: 'SMALL',
    dependsOnCategories: ['PRODUCT_TRUTH', 'CONTRADICTION'],
  }),
  definition({
    id: 'recommendation.seo',
    description: 'Plans SEO issue resolution after factual blockers.',
    category: 'SEO',
    match: { issueCategories: ['SEO'] },
    order: 50,
    baseScore: 50,
    defaultEffort: 'SMALL',
    dependsOnCategories: ['PRODUCT_TRUTH', 'CONTRADICTION', 'IDENTITY'],
  }),
  definition({
    id: 'recommendation.media',
    description: 'Plans media completeness and metadata work.',
    category: 'MEDIA',
    match: { issueCategories: ['MEDIA'] },
    order: 60,
    baseScore: 48,
    defaultEffort: 'SMALL',
    dependsOnCategories: ['CONTRADICTION'],
  }),
  definition({
    id: 'recommendation.variants',
    description: 'Plans variant and price corrections.',
    category: 'VARIANTS',
    match: { issueCategories: ['VARIANT', 'PRICING'] },
    order: 70,
    baseScore: 68,
    defaultEffort: 'MEDIUM',
    dependsOnCategories: ['PRODUCT_TRUTH', 'CONTRADICTION', 'IDENTITY'],
  }),
  definition({
    id: 'recommendation.catalog',
    description: 'Plans catalog-wide consistency corrections.',
    category: 'CATALOG',
    match: { issueCategories: ['CATALOG_HEALTH'] },
    order: 80,
    baseScore: 52,
    defaultEffort: 'MEDIUM',
    dependsOnCategories: ['PRODUCT_TRUTH', 'CONTRADICTION', 'IDENTITY'],
  }),
  definition({
    id: 'recommendation.data-completeness',
    description: 'Plans remaining generic data-completeness work.',
    category: 'DATA_COMPLETENESS',
    match: { issueCategories: ['DATA_QUALITY', 'SPECIFICATION', 'OTHER'] },
    order: 90,
    baseScore: 58,
    defaultEffort: 'SMALL',
    dependsOnCategories: ['PRODUCT_TRUTH', 'CONTRADICTION'],
  }),
]);

export function createDefaultRecommendationRuleRegistry(): RecommendationRuleRegistry {
  const registry = new RecommendationRuleRegistry();
  for (const rule of DEFAULT_RECOMMENDATION_RULE_DEFINITIONS) registry.register(rule);
  return registry;
}
