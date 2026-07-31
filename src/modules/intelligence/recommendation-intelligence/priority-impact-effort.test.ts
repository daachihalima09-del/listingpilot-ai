import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextFixture } from '../testing/fixtures.ts';
import {
  recommendationIssueFixture,
  sourceRecommendationFixture,
} from '../testing/recommendation-intelligence-fixtures.ts';
import { RecommendationAppropriatenessConfidenceStrategy } from './confidence.ts';
import { createRecommendationIntelligenceConfiguration } from './configuration.ts';
import {
  estimateMerchantEffort,
  estimateRecommendationImpact,
} from './impact-effort.ts';
import { prioritizeRecommendation } from './prioritization.ts';
import { createDefaultRecommendationRuleRegistry } from './rules.ts';

function ruleFor(input: {
  category: Parameters<ReturnType<typeof createDefaultRecommendationRuleRegistry>['match']>[0]['issueCategory'];
  code: string;
  ruleId: string;
  detectorId: string;
  severity: Parameters<ReturnType<typeof createDefaultRecommendationRuleRegistry>['match']>[0]['severity'];
}) {
  const rule = createDefaultRecommendationRuleRegistry().match({
    issueCategory: input.category,
    issueCode: input.code,
    ruleId: input.ruleId,
    detectorId: input.detectorId,
    severity: input.severity,
  });
  assert.ok(rule);
  return rule;
}

test('impact follows deterministic severity policy', () => {
  const issue = recommendationIssueFixture({ severity: 'HIGH' });
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  assert.equal(estimateRecommendationImpact({
    issue,
    sourceRecommendations: [],
    rule,
  }), 'HIGH');
});

test('source impact and business importance can promote impact deterministically', () => {
  const issue = recommendationIssueFixture({
    severity: 'LOW',
    metadata: {
      ruleId: 'product.description.too_short',
      importance: 'CRITICAL',
    },
  });
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  assert.equal(estimateRecommendationImpact({
    issue,
    sourceRecommendations: [sourceRecommendationFixture(issue.id, {
      estimatedImpact: 'HIGH',
    })],
    rule,
  }), 'CRITICAL');
});

test('effort uses merchant field count thresholds', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  const issue = recommendationIssueFixture({
    affectedFields: ['one', 'two', 'three', 'four'],
  });
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  assert.equal(estimateMerchantEffort({
    issue,
    sourceRecommendations: [],
    rule,
    configuration,
  }), 'LARGE');
});

test('source effort can increase but never randomly decrease merchant effort', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  const issue = recommendationIssueFixture();
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  assert.equal(estimateMerchantEffort({
    issue,
    sourceRecommendations: [sourceRecommendationFixture(issue.id, {
      estimatedEffort: 'HIGH',
    })],
    rule,
    configuration,
  }), 'LARGE');
});

test('appropriateness confidence is bounded and explainable', () => {
  const issue = recommendationIssueFixture();
  const confidence = new RecommendationAppropriatenessConfidenceStrategy().calculate({
    issue,
    sourceRecommendations: [sourceRecommendationFixture(issue.id)],
    thresholds: contextFixture().confidenceThresholds,
    ruleMatched: true,
    traceable: true,
  });
  assert.equal(confidence.value <= 0.98, true);
  assert.equal(confidence.value > 0.8, true);
  assert.deepEqual(confidence.factors.map(({ code }) => code), [
    'RULE_APPLICABILITY',
    'SOURCE_RECOMMENDATION_SUPPORT',
    'TRACEABILITY_COMPLETENESS',
  ]);
  assert.equal(confidence.strategyVersion, '1.0.0');
});

test('recommendation confidence represents appropriateness rather than underlying truth', () => {
  const issue = recommendationIssueFixture({
    confidence: {
      value: 0.2,
      level: 'VERY_LOW',
      strategyVersion: 'underlying-data',
      factors: [],
    },
  });
  const confidence = new RecommendationAppropriatenessConfidenceStrategy().calculate({
    issue,
    sourceRecommendations: [sourceRecommendationFixture(issue.id, {
      confidence: {
        value: 0.9,
        level: 'VERY_HIGH',
        strategyVersion: 'source-recommendation',
        factors: [],
      },
    })],
    thresholds: contextFixture().confidenceThresholds,
    ruleMatched: true,
    traceable: true,
  });
  assert.equal(confidence.value > issue.confidence!.value, true);
  assert.equal(confidence.factors[0].explanation.includes('rule applies'), true);
});

test('severity raises deterministic priority score', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  const low = recommendationIssueFixture({ severity: 'LOW' });
  const high = recommendationIssueFixture({ severity: 'HIGH' });
  const rule = ruleFor({
    category: low.category,
    code: low.code,
    ruleId: 'product.description.too_short',
    detectorId: low.detectorId,
    severity: low.severity,
  });
  const lowPriority = prioritizeRecommendation({
    issue: low,
    rule,
    blocker: false,
    confidence: 0.9,
    dependentCount: 0,
    configuration,
  });
  const highPriority = prioritizeRecommendation({
    issue: high,
    rule,
    blocker: false,
    confidence: 0.9,
    dependentCount: 0,
    configuration,
  });
  assert.equal(highPriority.score > lowPriority.score, true);
  assert.equal(highPriority.priority < lowPriority.priority, true);
});

test('blockers and recommendations that unlock dependents receive explicit priority factors', () => {
  const configuration = createRecommendationIntelligenceConfiguration();
  const issue = recommendationIssueFixture({ severity: 'MEDIUM' });
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  const result = prioritizeRecommendation({
    issue,
    rule,
    blocker: true,
    confidence: 0.9,
    dependentCount: 3,
    configuration,
  });
  assert.equal(result.factors.blocking, 30);
  assert.equal(result.factors.dependencyUnlock, 12);
  assert.equal(result.priority <= 2, true);
});

test('priority threshold overrides remain deterministic', () => {
  const configuration = createRecommendationIntelligenceConfiguration({
    priorityThresholds: {
      priority1Minimum: 200,
      priority2Minimum: 150,
      priority3Minimum: 100,
      priority4Minimum: 50,
    },
  });
  const issue = recommendationIssueFixture({ severity: 'LOW' });
  const rule = ruleFor({
    category: issue.category,
    code: issue.code,
    ruleId: 'product.description.too_short',
    detectorId: issue.detectorId,
    severity: issue.severity,
  });
  assert.equal(prioritizeRecommendation({
    issue,
    rule,
    blocker: false,
    confidence: 0.9,
    dependentCount: 0,
    configuration,
  }).priority, 4);
});
