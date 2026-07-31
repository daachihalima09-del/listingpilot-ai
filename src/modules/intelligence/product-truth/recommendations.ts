import type {
  EstimatedImpact,
  IntelligenceContext,
  IntelligenceIssue,
  IntelligenceRecommendation,
  RecommendationPriority,
} from '../domain/types.ts';
import type { IntelligenceHasher } from '../deterministic/services.ts';
import type { RecommendationStrategy } from '../recommendations/engine.ts';
import { PRODUCT_TRUTH_VERSION } from './configuration.ts';
import {
  PRODUCT_TRUTH_ISSUE_CODES,
  productTruthRecommendationId,
  type ProductTruthIssueCode,
} from './issues.ts';

const guidance: Readonly<Record<ProductTruthIssueCode, {
  title: string;
  explanation: string;
  priority: RecommendationPriority;
  impact: EstimatedImpact;
}>> = {
  'truth.claim.conflicted': {
    title: 'Review conflicting product claims',
    explanation: 'Review the conflicting values and select the value supported by the most authoritative evidence.',
    priority: 'HIGH',
    impact: 'HIGH',
  },
  'truth.claim.unresolved': {
    title: 'Resolve the product claim manually',
    explanation: 'Confirm the claim manually or add stronger evidence before approving it.',
    priority: 'HIGH',
    impact: 'HIGH',
  },
  'truth.evidence.insufficient': {
    title: 'Add stronger product evidence',
    explanation: 'Add traceable official manufacturer or product-document evidence before approving this claim.',
    priority: 'HIGH',
    impact: 'HIGH',
  },
  'truth.evidence.provenance_missing': {
    title: 'Attach evidence provenance',
    explanation: 'Attach a source reference so ListingPilot can evaluate the evidence reliability.',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
  },
  'truth.resolution.low_confidence': {
    title: 'Confirm the likely product value',
    explanation: 'Confirm this value manually or add stronger independent evidence before publishing it.',
    priority: 'MEDIUM',
    impact: 'MEDIUM',
  },
  'truth.override.conflicted': {
    title: 'Review the conflicting merchant override',
    explanation: 'Review the merchant override because it conflicts with stronger external evidence.',
    priority: 'HIGH',
    impact: 'HIGH',
  },
};

export class ProductTruthRecommendationStrategy implements RecommendationStrategy {
  readonly id = 'product-truth.review-guidance';
  readonly version = PRODUCT_TRUTH_VERSION;
  readonly priority = 200;
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
    return issues.flatMap((issue) => {
      if (!PRODUCT_TRUTH_ISSUE_CODES.includes(issue.code as ProductTruthIssueCode)) return [];
      const item = guidance[issue.code as ProductTruthIssueCode];
      const claimGroupId = typeof issue.metadata.claimGroupId === 'string'
        ? issue.metadata.claimGroupId
        : '';
      return [{
        id: productTruthRecommendationId(issue, this.hasher),
        fingerprint: '',
        issueIds: [issue.id],
        strategyId: this.id,
        strategyVersion: this.version,
        title: `${item.title} for ${issue.affectedProductIds[0]}`,
        explanation: item.explanation,
        actionType: 'VERIFY',
        affectedFields: issue.affectedFields,
        proposedValues: [],
        priority: item.priority,
        estimatedImpact: item.impact,
        estimatedEffort: 'MEDIUM',
        riskLevel: 'LOW',
        automationCapability: 'SUGGEST_ONLY',
        approvalRequirement: 'MERCHANT',
        confidence: issue.confidence,
        metadata: {
          claimGroupId,
          issueCode: issue.code,
          generatedFactualValue: false,
          deterministic: true,
        },
      }];
    });
  }
}
