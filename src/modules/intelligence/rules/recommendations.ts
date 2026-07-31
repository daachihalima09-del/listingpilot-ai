import type {
  EstimatedEffort,
  EstimatedImpact,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  IssueSeverity,
  RecommendationPriority,
  RiskLevel,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { RecommendationStrategy } from '../recommendations/engine.ts';
import { DETERMINISTIC_RULE_VERSION } from './definitions.ts';
import { RuleRegistry } from './registry.ts';

const priorityBySeverity: Readonly<Record<IssueSeverity, RecommendationPriority>> = {
  INFO: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'URGENT',
};
const impactBySeverity: Readonly<Record<IssueSeverity, EstimatedImpact>> = {
  INFO: 'LOW',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'HIGH',
};

export class DeterministicRuleRecommendationStrategy implements RecommendationStrategy {
  readonly id = 'deterministic-rule-guidance';
  readonly version = DETERMINISTIC_RULE_VERSION;
  readonly priority = 100;
  readonly enabled = true;
  private readonly registry: RuleRegistry;
  private readonly hasher: IntelligenceHasher;

  constructor(registry: RuleRegistry, hasher: IntelligenceHasher) {
    this.registry = registry;
    this.hasher = hasher;
  }

  recommend(
    issues: readonly IntelligenceIssue[],
    _context: IntelligenceContext,
  ): readonly IntelligenceRecommendation[] {
    void _context;
    return issues.flatMap((issue) => {
      const ruleId = typeof issue.metadata.ruleId === 'string' ? issue.metadata.ruleId : '';
      const rule = this.registry.get(ruleId);
      if (!rule) return [];
      const estimatedEffort: EstimatedEffort = issue.affectedFields.length > 3 ? 'MEDIUM' : 'LOW';
      const riskLevel: RiskLevel = issue.severity === 'CRITICAL' ? 'MEDIUM' : 'LOW';
      return [{
        id: `rule_recommendation_${this.hasher.hash({
          ruleId,
          issueIds: [issue.id],
          fields: issue.affectedFields,
        })}`,
        fingerprint: '',
        issueIds: [issue.id],
        strategyId: this.id,
        strategyVersion: this.version,
        title: `Resolve: ${rule.name}`,
        explanation: rule.recommendationTemplate,
        actionType: 'REVIEW',
        affectedFields: issue.affectedFields,
        proposedValues: [],
        priority: priorityBySeverity[issue.severity],
        estimatedImpact: impactBySeverity[issue.severity],
        estimatedEffort,
        riskLevel,
        automationCapability: 'SUGGEST_ONLY',
        approvalRequirement: 'MERCHANT',
        confidence: issue.confidence,
        metadata: {
          ruleId,
          ruleVersion: rule.version,
          generatedContent: false,
          deterministic: true,
        },
      }];
    });
  }
}
