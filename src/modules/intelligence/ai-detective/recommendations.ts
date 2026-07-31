import type { IntelligenceHasher } from '../deterministic/services.ts';
import type {
  EstimatedImpact,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  RecommendationPriority,
} from '../domain/types.ts';
import type { RecommendationStrategy } from '../recommendations/engine.ts';
import { AI_DETECTIVE_VERSION } from './configuration.ts';
import { AI_DETECTIVE_ISSUE_CODES } from './issues.ts';

const issueCodes = new Set(Object.values(AI_DETECTIVE_ISSUE_CODES));

function priorityFor(issue: IntelligenceIssue): RecommendationPriority {
  if (issue.severity === 'CRITICAL') return 'URGENT';
  if (issue.severity === 'HIGH') return 'HIGH';
  if (issue.severity === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function impactFor(issue: IntelligenceIssue): EstimatedImpact {
  if (issue.severity === 'CRITICAL' || issue.severity === 'HIGH') return 'HIGH';
  if (issue.severity === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

export class AIDetectiveRecommendationStrategy implements RecommendationStrategy {
  readonly id = 'ai-detective.merchant-review';
  readonly version = AI_DETECTIVE_VERSION;
  readonly priority = 300;
  readonly enabled = true;
  private readonly hasher: IntelligenceHasher;

  constructor(hasher: IntelligenceHasher) {
    this.hasher = hasher;
  }

  recommend(
    issues: readonly IntelligenceIssue[],
    _context: IntelligenceContext,
  ): readonly IntelligenceRecommendation[] {
    void _context;
    return issues
      .filter((issue) => issueCodes.has(issue.code))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((issue): IntelligenceRecommendation => {
        const contradictionId = typeof issue.metadata.contradictionId === 'string'
          ? issue.metadata.contradictionId
          : issue.id;
        const ruleId = typeof issue.metadata.ruleId === 'string'
          ? issue.metadata.ruleId
          : 'unknown';
        const explanation = typeof issue.metadata.recommendationTemplate === 'string'
          ? issue.metadata.recommendationTemplate
          : 'Review the contradictory product facts and their supporting evidence.';
        return {
          id: `detective_recommendation_${this.hasher.hash({ contradictionId, ruleId })}`,
          fingerprint: '',
          issueIds: [issue.id],
          strategyId: this.id,
          strategyVersion: this.version,
          title: `Review contradiction for ${issue.affectedProductIds[0]}`,
          explanation,
          actionType: 'VERIFY',
          affectedFields: issue.affectedFields,
          proposedValues: [],
          priority: priorityFor(issue),
          estimatedImpact: impactFor(issue),
          estimatedEffort: 'MEDIUM',
          riskLevel: 'LOW',
          automationCapability: 'SUGGEST_ONLY',
          approvalRequirement: 'MERCHANT',
          confidence: issue.confidence,
          metadata: {
            contradictionId,
            issueCode: issue.code,
            ruleId,
            generatedFactualValue: false,
            deterministic: true,
          },
        };
      });
  }
}
