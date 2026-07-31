import { IntelligenceDomainError } from '../domain/errors.ts';
import { immutableCopy } from '../domain/immutability.ts';
import type {
  ExtensionMetadata,
  IssueSeverity,
} from '../domain/types.ts';
import {
  AI_DETECTIVE_VERSION,
  CONTRADICTION_TYPES,
} from './configuration.ts';
import type { ContradictionType } from './types.ts';

export type FactConditionOperator = 'EQUALS' | 'NOT_EQUALS' | 'EXISTS' | 'IN';
export type FactSource = 'PRODUCT_TRUTH' | 'NORMALIZED_FIELD' | 'ANY';

export interface ContradictionFactCondition {
  readonly source: FactSource;
  readonly fieldPath: string;
  readonly operator: FactConditionOperator;
  readonly value?: unknown;
  readonly values?: readonly unknown[];
}

export interface CombinationContradictionPolicy {
  readonly left: ContradictionFactCondition;
  readonly right: ContradictionFactCondition;
}

export interface ContradictionRuleDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly contradictionType: ContradictionType;
  readonly severity: IssueSeverity;
  readonly enabled: boolean;
  readonly deterministic: boolean;
  readonly explanationTemplate: string;
  readonly recommendationTemplate: string;
  readonly detectorFamily: string;
  readonly combination?: CombinationContradictionPolicy;
  readonly metadata: ExtensionMetadata;
}

interface RuleRegistration {
  readonly rule: ContradictionRuleDefinition;
  enabled: boolean;
}

const severities: readonly IssueSeverity[] = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const factSources: readonly FactSource[] = ['PRODUCT_TRUTH', 'NORMALIZED_FIELD', 'ANY'];
const factOperators: readonly FactConditionOperator[] = ['EQUALS', 'NOT_EQUALS', 'EXISTS', 'IN'];

function validCondition(condition: ContradictionFactCondition): boolean {
  if (!condition.fieldPath.trim()
    || !factSources.includes(condition.source)
    || !factOperators.includes(condition.operator)) return false;
  if ((condition.operator === 'EQUALS' || condition.operator === 'NOT_EQUALS')
    && condition.value === undefined) return false;
  if (condition.operator === 'IN'
    && (!Array.isArray(condition.values) || condition.values.length === 0)) return false;
  return true;
}

export class ContradictionRuleRegistry {
  private readonly entries = new Map<string, RuleRegistration>();

  register(rule: ContradictionRuleDefinition): void {
    if (!rule.id.trim() || !rule.version.trim() || !rule.name.trim()
      || !rule.description.trim() || !rule.explanationTemplate.trim()
      || !rule.recommendationTemplate.trim() || !rule.detectorFamily.trim()
      || !rule.deterministic || !CONTRADICTION_TYPES.includes(rule.contradictionType)
      || !severities.includes(rule.severity)) {
      throw new IntelligenceDomainError('INVALID_DETECTOR', 'Contradiction rule metadata is invalid.');
    }
    if ((rule.contradictionType === 'IMPOSSIBLE_COMBINATION'
      || rule.contradictionType === 'SUSPICIOUS_COMBINATION')
      && (!rule.combination
        || !validCondition(rule.combination.left)
        || !validCondition(rule.combination.right))) {
      throw new IntelligenceDomainError(
        'INVALID_DETECTOR',
        'Combination contradiction rules require two field conditions.',
      );
    }
    if (this.entries.has(rule.id)) {
      throw new IntelligenceDomainError('DUPLICATE_REGISTRY_ENTRY', 'Contradiction rule ID is already registered.', {
        id: rule.id,
      });
    }
    this.entries.set(rule.id, {
      rule: immutableCopy(rule) as ContradictionRuleDefinition,
      enabled: rule.enabled,
    });
  }

  get(id: string): ContradictionRuleDefinition | undefined {
    return this.entries.get(id)?.rule;
  }

  enable(id: string): void {
    this.require(id).enabled = true;
  }

  disable(id: string): void {
    this.require(id).enabled = false;
  }

  filter(input: {
    readonly family?: string;
    readonly types?: readonly ContradictionType[];
  } = {}): readonly ContradictionRuleDefinition[] {
    const types = input.types ? new Set(input.types) : null;
    return [...this.entries.values()]
      .filter(({ rule, enabled }) => enabled
        && (!input.family || rule.detectorFamily === input.family)
        && (!types || types.has(rule.contradictionType)))
      .map(({ rule }) => rule)
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  snapshot(): readonly Readonly<{
    id: string;
    version: string;
    contradictionType: ContradictionType;
    severity: IssueSeverity;
    enabled: boolean;
  }>[] {
    return immutableCopy([...this.entries.values()]
      .sort((left, right) => left.rule.id.localeCompare(right.rule.id))
      .map(({ rule, enabled }) => ({
        id: rule.id,
        version: rule.version,
        contradictionType: rule.contradictionType,
        severity: rule.severity,
        enabled,
      })));
  }

  private require(id: string): RuleRegistration {
    const entry = this.entries.get(id);
    if (!entry) {
      throw new IntelligenceDomainError('INVALID_IDENTITY', 'Contradiction rule is not registered.', { id });
    }
    return entry;
  }
}

const definitions: readonly ContradictionRuleDefinition[] = [
  {
    id: 'detective.truth.value-conflict',
    version: AI_DETECTIVE_VERSION,
    name: 'Conflicting truth candidates',
    description: 'Detects Product Truth findings with materially supported conflicting values.',
    contradictionType: 'VALUE_CONFLICT',
    severity: 'HIGH',
    enabled: true,
    deterministic: true,
    explanationTemplate: '{field} has materially supported conflicting values: {values}. Merchant review is required because no verified value can be selected safely.',
    recommendationTemplate: 'Review the conflicting values and choose only a value supported by authoritative evidence.',
    detectorFamily: 'truth-conflict',
    metadata: {},
  },
  {
    id: 'detective.identity.duplicate-sku',
    version: AI_DETECTIVE_VERSION,
    name: 'Duplicate SKU identity',
    description: 'Detects the same normalized SKU on multiple variants or products.',
    contradictionType: 'DUPLICATE_IDENTITY',
    severity: 'HIGH',
    enabled: true,
    deterministic: true,
    explanationTemplate: 'The SKU identity {identity} is assigned to multiple records: {records}. Merchant review is required because identity collisions can target the wrong product.',
    recommendationTemplate: 'Confirm the intended SKU and assign unique identities where required.',
    detectorFamily: 'identity-conflict',
    metadata: { identityField: 'sku' },
  },
  {
    id: 'detective.identity.duplicate-barcode',
    version: AI_DETECTIVE_VERSION,
    name: 'Duplicate barcode identity',
    description: 'Detects the same normalized barcode on multiple variants or products.',
    contradictionType: 'DUPLICATE_IDENTITY',
    severity: 'HIGH',
    enabled: true,
    deterministic: true,
    explanationTemplate: 'The barcode identity {identity} is assigned to multiple records: {records}. Merchant review is required because identity collisions can misrepresent products.',
    recommendationTemplate: 'Confirm the intended barcode and correct duplicate assignments.',
    detectorFamily: 'identity-conflict',
    metadata: { identityField: 'barcode' },
  },
  {
    id: 'detective.evidence.override-conflict',
    version: AI_DETECTIVE_VERSION,
    name: 'Merchant override conflicts with evidence',
    description: 'Detects merchant overrides that retain materially supported conflicting evidence.',
    contradictionType: 'WEAK_EVIDENCE',
    severity: 'HIGH',
    enabled: true,
    deterministic: true,
    explanationTemplate: 'The merchant override for {field} conflicts with stronger supplied evidence. Merchant review is required before relying on the override.',
    recommendationTemplate: 'Review the override and attach stronger evidence before approval.',
    detectorFamily: 'weak-evidence',
    metadata: {},
  },
  {
    id: 'detective.listing.truth-mismatch',
    version: AI_DETECTIVE_VERSION,
    name: 'Verified truth differs from listing',
    description: 'Detects current normalized listing values that differ from verified Product Truth.',
    contradictionType: 'TRUTH_LISTING_MISMATCH',
    severity: 'HIGH',
    enabled: true,
    deterministic: true,
    explanationTemplate: 'The current listing value for {field} is {listingValue}, while Product Truth selected {truthValue}. Merchant review is required because the published fact may be incorrect.',
    recommendationTemplate: 'Review the listing and verified evidence; approve any correction manually.',
    detectorFamily: 'listing-conflict',
    metadata: {},
  },
];

export const DEFAULT_CONTRADICTION_RULE_DEFINITIONS = Object.freeze(definitions);
export const DEFAULT_CONTRADICTION_RULE_IDS = Object.freeze(definitions.map(({ id }) => id));

export function createDefaultContradictionRuleRegistry(): ContradictionRuleRegistry {
  const registry = new ContradictionRuleRegistry();
  for (const rule of definitions) registry.register(rule);
  return registry;
}
