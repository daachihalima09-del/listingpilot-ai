import type { IntelligenceContext, IntelligenceIssue, IssueCategory } from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type {
  DetectorMetadata,
  DetectorResult,
  IntelligenceDetector,
} from '../detectors/contract.ts';
import type { DeterministicRuleConfiguration } from './configuration.ts';
import { DETERMINISTIC_QUALITY_CAPABILITY_ID, DETERMINISTIC_RULE_VERSION } from './definitions.ts';
import {
  evaluateCatalogRules,
  evaluateDescriptionRules,
  evaluateMediaRules,
  evaluateProductIdentityRules,
  evaluateSeoRules,
  evaluateSpecificationRules,
  evaluateTagRules,
  evaluateVariantRules,
  type RuleMap,
} from './evaluation.ts';
import { RuleRegistry } from './registry.ts';

type RuleEvaluator = (input: {
  readonly context: IntelligenceContext;
  readonly configuration: DeterministicRuleConfiguration;
  readonly rules: RuleMap;
  readonly detector: DetectorMetadata;
  readonly hasher: IntelligenceHasher;
}) => readonly IntelligenceIssue[];

export interface SynchronousRuleDetector extends IntelligenceDetector {
  execute(context: IntelligenceContext): DetectorResult;
}

interface DetectorDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly family: string;
  readonly categories: readonly IssueCategory[];
  readonly priority: number;
  readonly evaluator: RuleEvaluator;
}

const detectorDefinitions: readonly DetectorDefinition[] = [
  { id: 'rules.product-identity', displayName: 'Product identity rules', description: 'Evaluates universal product identity fields.', family: 'product-identity', categories: ['DATA_QUALITY', 'SEO'], priority: 100, evaluator: evaluateProductIdentityRules },
  { id: 'rules.description', displayName: 'Description rules', description: 'Evaluates description presence, length, and duplicates.', family: 'description', categories: ['DATA_QUALITY', 'CATALOG_HEALTH'], priority: 200, evaluator: evaluateDescriptionRules },
  { id: 'rules.variant', displayName: 'Variant rules', description: 'Evaluates variants, identities, prices, SKUs, and barcodes.', family: 'variant', categories: ['VARIANT', 'PRICING'], priority: 300, evaluator: evaluateVariantRules },
  { id: 'rules.media', displayName: 'Media rules', description: 'Evaluates generic media identity and metadata.', family: 'media', categories: ['MEDIA'], priority: 400, evaluator: evaluateMediaRules },
  { id: 'rules.seo', displayName: 'SEO rules', description: 'Evaluates generic SEO field presence and lengths.', family: 'seo', categories: ['SEO'], priority: 500, evaluator: evaluateSeoRules },
  { id: 'rules.specification', displayName: 'Specification rules', description: 'Evaluates generic specification identity, values, and units.', family: 'specification', categories: ['SPECIFICATION'], priority: 600, evaluator: evaluateSpecificationRules },
  { id: 'rules.tag', displayName: 'Tag rules', description: 'Evaluates empty, duplicate, and excessive tags.', family: 'tag', categories: ['CATALOG_HEALTH'], priority: 700, evaluator: evaluateTagRules },
  { id: 'rules.catalog', displayName: 'Catalog duplicate rules', description: 'Evaluates cross-product title and handle duplicates.', family: 'catalog', categories: ['CATALOG_HEALTH'], priority: 800, evaluator: evaluateCatalogRules },
];

class DeterministicRuleDetector implements SynchronousRuleDetector {
  readonly metadata: DetectorMetadata;
  private readonly family: string;
  private readonly evaluator: RuleEvaluator;
  private readonly registry: RuleRegistry;
  private readonly configuration: DeterministicRuleConfiguration;
  private readonly hasher: IntelligenceHasher;

  constructor(input: {
    readonly definition: DetectorDefinition;
    readonly registry: RuleRegistry;
    readonly configuration: DeterministicRuleConfiguration;
    readonly hasher: IntelligenceHasher;
  }) {
    this.family = input.definition.family;
    this.evaluator = input.definition.evaluator;
    this.registry = input.registry;
    this.configuration = input.configuration;
    this.hasher = input.hasher;
    const metadata: DetectorMetadata = {
      id: input.definition.id,
      displayName: input.definition.displayName,
      version: DETERMINISTIC_RULE_VERSION,
      description: input.definition.description,
      issueCategories: input.definition.categories,
      supportedScopes: ['SINGLE_PRODUCT', 'SELECTED_PRODUCTS', 'FULL_CATALOG'],
      requiredCapabilities: [DETERMINISTIC_QUALITY_CAPABILITY_ID],
      priority: input.definition.priority,
      timeoutMs: 5_000,
      parallelSafe: true,
      enabled: true,
      deterministic: true,
    };
    this.metadata = Object.freeze(metadata);
  }

  execute(context: IntelligenceContext): DetectorResult {
    const rules = new Map(
      this.registry.filter({
        scope: context.analysisScope,
        knowledgePackIds: context.knowledgePackIds,
        capabilityPackIds: context.capabilityPackIds,
      })
        .filter((rule) => rule.metadata.family === this.family)
        .map((rule) => [rule.id, rule]),
    );
    const issues = this.evaluator({
      context,
      configuration: this.configuration,
      rules,
      detector: this.metadata,
      hasher: this.hasher,
    });
    return {
      issues,
      warnings: [],
      metrics: {
        evaluatedRules: rules.size,
        inspectedProducts: context.products.length,
        producedIssues: issues.length,
      },
      metadata: {
        ruleFamily: this.family,
        configurationVersion: DETERMINISTIC_RULE_VERSION,
      },
    };
  }
}

export function createDeterministicRuleDetectors(input: {
  readonly registry: RuleRegistry;
  readonly configuration: DeterministicRuleConfiguration;
  readonly hasher: IntelligenceHasher;
}): readonly SynchronousRuleDetector[] {
  return Object.freeze(detectorDefinitions.map((definition) => new DeterministicRuleDetector({
    definition,
    ...input,
  })));
}
