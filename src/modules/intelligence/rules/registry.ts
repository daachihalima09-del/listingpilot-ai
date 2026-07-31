import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  AnalysisScope,
  ExtensionMetadata,
  IssueCategory,
  IssueSeverity,
} from '../domain/types.ts';

export interface IntelligenceRuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly issueCode: string;
  readonly category: IssueCategory;
  readonly severity: IssueSeverity;
  readonly supportedScopes: readonly AnalysisScope[];
  readonly affectedFields: readonly string[];
  readonly explanationTemplate: string;
  readonly recommendationTemplate: string;
  readonly configurationKey?: string;
  readonly requiredKnowledgePacks: readonly string[];
  readonly requiredCapabilityPacks: readonly string[];
  readonly enabled: boolean;
  readonly deterministic: boolean;
  readonly metadata: ExtensionMetadata;
}

export interface RuleSnapshot {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly deterministic: boolean;
}

interface RuleRegistration {
  readonly rule: IntelligenceRuleDefinition;
  enabled: boolean;
}

export class RuleRegistry {
  private readonly entries = new Map<string, RuleRegistration>();

  register(rule: IntelligenceRuleDefinition): void {
    if (
      !rule.id.trim()
      || !rule.version.trim()
      || !rule.issueCode.trim()
      || !rule.name.trim()
      || !rule.explanationTemplate.trim()
      || !rule.recommendationTemplate.trim()
      || rule.affectedFields.length === 0
      || rule.supportedScopes.length === 0
    ) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Rules require complete stable identity and policy metadata.');
    }
    if (this.entries.has(rule.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Rule ID is already registered.', { id: rule.id });
    }
    this.entries.set(rule.id, { rule: immutableCopy(rule) as IntelligenceRuleDefinition, enabled: rule.enabled });
  }

  get(id: string): IntelligenceRuleDefinition | undefined {
    return this.entries.get(id)?.rule;
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  filter(input: {
    readonly category?: IssueCategory;
    readonly scope?: AnalysisScope;
    readonly knowledgePackIds?: readonly string[];
    readonly capabilityPackIds?: readonly string[];
  }): readonly IntelligenceRuleDefinition[] {
    const knowledge = new Set(input.knowledgePackIds ?? []);
    const capabilities = new Set(input.capabilityPackIds ?? []);
    return this.sorted()
      .filter(({ rule, enabled }) => enabled
        && (!input.category || rule.category === input.category)
        && (!input.scope || rule.supportedScopes.includes(input.scope))
        && rule.requiredKnowledgePacks.every((id) => knowledge.has(id))
        && rule.requiredCapabilityPacks.every((id) => capabilities.has(id)))
      .map(({ rule }) => rule);
  }

  snapshot(): readonly RuleSnapshot[] {
    return immutableCopy(this.sorted().map(({ rule, enabled }) => ({
      id: rule.id,
      name: rule.name,
      version: rule.version,
      enabled,
      deterministic: rule.deterministic,
    }))) as readonly RuleSnapshot[];
  }

  private require(id: string): RuleRegistration {
    const entry = this.entries.get(id);
    if (!entry) throw new IntelligenceDomainError('INVALID_IDENTITY', 'Rule is not registered.', { id });
    return entry;
  }

  private sorted(): RuleRegistration[] {
    return [...this.entries.values()].sort((left, right) => left.rule.id.localeCompare(right.rule.id));
  }
}
