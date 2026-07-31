import { confidenceLevel } from '../confidence/confidence.ts';
import type {
  ConfidenceResult,
  IntelligenceContext,
  IntelligenceIssue,
  IssueScope,
} from '../domain/types.ts';
import { validateConfidence } from '../domain/validation.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { DetectorMetadata } from '../detectors/contract.ts';
import type { IntelligenceRuleDefinition } from './registry.ts';

export interface RuleIssueTarget {
  readonly affectedProductIds: readonly string[];
  readonly affectedVariantIds?: readonly string[];
  readonly affectedFields?: readonly string[];
  readonly scope?: IssueScope;
  readonly evidenceIds?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function deterministicRuleConfidence(context: IntelligenceContext): ConfidenceResult {
  const value = 0.9;
  const result: ConfidenceResult = {
    value,
    level: confidenceLevel(value, context.confidenceThresholds),
    strategyVersion: 'deterministic-rule-1.0.0',
    factors: [{
      code: 'DETERMINISTIC_RULE_MATCH',
      label: 'Deterministic rule match',
      contribution: 0.4,
      explanation: 'The issue follows directly from supplied normalized fields and a versioned deterministic rule.',
      metadata: { deterministic: true },
    }],
  };
  validateConfidence(result);
  return result;
}

export function createRuleIssue(input: {
  readonly rule: IntelligenceRuleDefinition;
  readonly detector: DetectorMetadata;
  readonly context: IntelligenceContext;
  readonly target: RuleIssueTarget;
  readonly hasher: IntelligenceHasher;
}): IntelligenceIssue {
  const productIds = [...new Set(input.target.affectedProductIds)].sort();
  const variantIds = [...new Set(input.target.affectedVariantIds ?? [])].sort();
  const fields = [...new Set(input.target.affectedFields ?? input.rule.affectedFields)].sort();
  const identity = {
    ruleId: input.rule.id,
    productIds,
    variantIds,
    fields,
    metadata: input.target.metadata ?? {},
  };
  return {
    id: `rule_issue_${input.hasher.hash(identity)}`,
    fingerprint: '',
    detectorId: input.detector.id,
    detectorVersion: input.detector.version,
    code: input.rule.issueCode,
    title: input.rule.name,
    explanation: input.rule.explanationTemplate,
    category: input.rule.category,
    severity: input.rule.severity,
    status: 'OPEN',
    scope: input.target.scope ?? 'FIELD',
    affectedProductIds: productIds,
    affectedVariantIds: variantIds,
    affectedFields: fields,
    evidenceIds: [...new Set(input.target.evidenceIds ?? [])].sort(),
    confidence: deterministicRuleConfidence(input.context),
    recommendationIds: [],
    metadata: {
      ruleId: input.rule.id,
      ruleVersion: input.rule.version,
      deterministic: input.rule.deterministic,
      semanticDetectorId: `rule:${input.rule.id}`,
      resolution: input.rule.recommendationTemplate,
      ...input.target.metadata,
    },
    createdAt: input.context.execution.requestedAt,
  };
}
