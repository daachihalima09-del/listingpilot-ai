import { immutableCopy } from '../domain/immutability.ts';
import type {
  ConfidenceFactor,
  ConfidenceResult,
  ConfidenceThresholds,
  IntelligenceIssue,
  IntelligenceRecommendation,
} from '../domain/types.ts';
import { confidenceLevel } from '../confidence/confidence.ts';
import { validateConfidence } from '../domain/validation.ts';
import { RECOMMENDATION_INTELLIGENCE_VERSION } from './configuration.ts';

function factor(
  code: string,
  label: string,
  contribution: number,
  explanation: string,
): ConfidenceFactor {
  return {
    code,
    label,
    contribution,
    explanation,
    metadata: {},
  };
}

export class RecommendationAppropriatenessConfidenceStrategy {
  readonly id = 'recommendation-intelligence.appropriateness';
  readonly version = RECOMMENDATION_INTELLIGENCE_VERSION;

  calculate(input: {
    readonly issue: IntelligenceIssue;
    readonly sourceRecommendations: readonly IntelligenceRecommendation[];
    readonly thresholds: ConfidenceThresholds;
    readonly ruleMatched: boolean;
    readonly traceable: boolean;
  }): ConfidenceResult {
    const ruleApplicability = input.ruleMatched ? 0.94 : 0.5;
    const recommendationSupport = input.sourceRecommendations.length > 0
      ? input.sourceRecommendations.reduce(
        (sum, recommendation) => sum + (recommendation.confidence?.value ?? 0.75),
        0,
      ) / input.sourceRecommendations.length
      : Math.max(0.65, input.issue.confidence?.value ?? 0.65);
    const traceability = input.traceable ? 0.96 : 0.7;
    const value = Math.min(
      0.98,
      ruleApplicability * 0.5 + recommendationSupport * 0.3 + traceability * 0.2,
    );
    const result: ConfidenceResult = {
      value,
      level: confidenceLevel(value, input.thresholds),
      strategyVersion: this.version,
      factors: [
        factor(
          'RULE_APPLICABILITY',
          'Recommendation rule applicability',
          ruleApplicability,
          'Measures certainty that the deterministic recommendation rule applies to the issue.',
        ),
        factor(
          'SOURCE_RECOMMENDATION_SUPPORT',
          'Source recommendation support',
          recommendationSupport,
          'Measures support from existing deterministic recommendation output, not certainty of an underlying fact.',
        ),
        factor(
          'TRACEABILITY_COMPLETENESS',
          'Traceability completeness',
          traceability,
          'Measures whether the recommendation remains connected to its triggering issue and upstream findings.',
        ),
      ],
    };
    validateConfidence(result);
    return immutableCopy(result) as ConfidenceResult;
  }
}
