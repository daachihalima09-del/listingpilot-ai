import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { contextFixture } from '../testing/fixtures.ts';
import { contradictionFixture } from '../testing/ai-detective-fixtures.ts';
import { createAIDetectiveConfiguration } from './configuration.ts';
import {
  createAIDetectiveIssues,
} from './issues.ts';
import { AIDetectiveRecommendationStrategy } from './recommendations.ts';
import {
  createDetectiveFindings,
  createDetectiveReport,
} from './report.ts';
import { evaluateDetectiveQualityStatus } from './quality-status.ts';

const hasher = new DeterministicHasher();

test('contradictions become traceable Intelligence Issues without duplicating Product Truth issue codes', () => {
  const contradiction = contradictionFixture();
  const issue = createAIDetectiveIssues({
    contradictions: [contradiction],
    context: contextFixture(),
    detectorId: 'ai-detective.truth-conflict',
    hasher,
  })[0];
  assert.equal(issue.code, 'detective.value_conflict');
  assert.equal(issue.category, 'PRODUCT_TRUTH');
  assert.equal(issue.metadata.contradictionId, contradiction.id);
  assert.deepEqual(issue.metadata.truthFindingIds, contradiction.involvedTruthFindingIds);
  assert.deepEqual(issue.evidenceIds, contradiction.involvedEvidenceIds);
  assert.equal(issue.code.startsWith('truth.'), false);
});

test('catalog identity contradictions become catalog-scoped issues', () => {
  const issue = createAIDetectiveIssues({
    contradictions: [contradictionFixture({
      type: 'DUPLICATE_IDENTITY',
      affectedProductIds: ['p1', 'p2'],
      affectedVariantIds: ['v1', 'v2'],
    })],
    context: contextFixture(),
    detectorId: 'ai-detective.identity-conflict',
    hasher,
  })[0];
  assert.equal(issue.scope, 'CATALOG');
});

test('recommendations require merchant approval and never generate replacement values', () => {
  const contradiction = contradictionFixture();
  const issue = createAIDetectiveIssues({
    contradictions: [contradiction],
    context: contextFixture(),
    detectorId: 'ai-detective.truth-conflict',
    hasher,
  })[0];
  const recommendation = new AIDetectiveRecommendationStrategy(hasher)
    .recommend([issue], contextFixture())[0];
  assert.ok(recommendation);
  assert.equal(recommendation.approvalRequirement, 'MERCHANT');
  assert.equal(recommendation.automationCapability, 'SUGGEST_ONLY');
  assert.deepEqual(recommendation.proposedValues, []);
  assert.equal(recommendation.metadata.generatedFactualValue, false);
});

test('recommendation IDs are deterministic and match contradiction references', () => {
  const contradictionId = 'contradiction-stable';
  const ruleId = 'detective.truth.value-conflict';
  const expectedId = `detective_recommendation_${hasher.hash({ contradictionId, ruleId })}`;
  const contradiction = contradictionFixture({
    id: contradictionId,
    ruleId,
    recommendationIds: [expectedId],
  });
  const issue = createAIDetectiveIssues({
    contradictions: [contradiction],
    context: contextFixture(),
    detectorId: 'ai-detective.truth-conflict',
    hasher,
  })[0];
  const strategy = new AIDetectiveRecommendationStrategy(hasher);
  const first = strategy.recommend([issue], contextFixture())[0];
  const second = strategy.recommend([issue], contextFixture())[0];
  assert.equal(first.id, expectedId);
  assert.equal(second.id, first.id);
  assert.deepEqual(issue.recommendationIds, [first.id]);
});

test('recommendation guidance comes from the contradiction rule template', () => {
  const issue = createAIDetectiveIssues({
    contradictions: [contradictionFixture({
      metadata: {
        recommendationTemplate: 'Confirm the correct identity.',
        detectorFamily: 'identity-conflict',
      },
    })],
    context: contextFixture(),
    detectorId: 'ai-detective.identity-conflict',
    hasher,
  })[0];
  const recommendation = new AIDetectiveRecommendationStrategy(hasher)
    .recommend([issue], contextFixture())[0];
  assert.equal(recommendation.explanation, 'Confirm the correct identity.');
});

test('non-Detective issues are ignored by the recommendation strategy', () => {
  const issue = createAIDetectiveIssues({
    contradictions: [contradictionFixture()],
    context: contextFixture(),
    detectorId: 'ai-detective.truth-conflict',
    hasher,
  })[0];
  assert.deepEqual(new AIDetectiveRecommendationStrategy(hasher).recommend([
    { ...issue, code: 'truth.claim.conflicted' },
  ], contextFixture()), []);
});

test('blocking contradiction policies flow into Detective findings and blocked products', () => {
  const impossible = contradictionFixture({
    id: 'impossible',
    productId: 'p2',
    affectedProductIds: ['p2'],
    type: 'IMPOSSIBLE_COMBINATION',
    severity: 'CRITICAL',
  });
  const report = createDetectiveReport({
    context: contextFixture({ products: [] }),
    contradictions: [impossible],
    configuration: createAIDetectiveConfiguration(),
    hasher,
  });
  assert.equal(report.findings[0].reviewRequirement, 'BLOCKING');
  assert.deepEqual(report.blockedProducts, ['p2']);
  assert.equal(evaluateDetectiveQualityStatus(report).status, 'BLOCKED');
});

test('high severity findings require review while lower severity findings recommend review', () => {
  const findings = createDetectiveFindings({
    contradictions: [
      contradictionFixture({ id: 'high', severity: 'HIGH' }),
      contradictionFixture({ id: 'low', severity: 'LOW' }),
    ],
    configuration: createAIDetectiveConfiguration({
      blockingContradictionTypes: [],
    }),
    hasher,
  });
  assert.deepEqual(findings.map(({ reviewRequirement }) => reviewRequirement).sort(), ['OPTIONAL', 'REQUIRED']);
});

test('Detective report contains complete severity and type statistics', () => {
  const report = createDetectiveReport({
    context: contextFixture(),
    contradictions: [
      contradictionFixture({ id: 'a', type: 'VALUE_CONFLICT', severity: 'HIGH' }),
      contradictionFixture({ id: 'b', type: 'DUPLICATE_IDENTITY', severity: 'HIGH' }),
      contradictionFixture({ id: 'c', type: 'SUSPICIOUS_COMBINATION', severity: 'MEDIUM' }),
    ],
    configuration: createAIDetectiveConfiguration(),
    hasher,
  });
  assert.equal(report.contradictionsFound, 3);
  assert.equal(report.contradictionsBySeverity.HIGH, 2);
  assert.equal(report.contradictionsBySeverity.MEDIUM, 1);
  assert.equal(report.contradictionsBySeverity.INFO, 0);
  assert.equal(report.contradictionsByType.VALUE_CONFLICT, 1);
  assert.equal(report.contradictionsByType.WEAK_EVIDENCE, 0);
  assert.equal(report.reviewRequired, 2);
});

test('report ordering and fingerprints are deterministic', () => {
  const contradictions = [
    contradictionFixture({ id: 'z', fingerprint: 'z' }),
    contradictionFixture({ id: 'a', fingerprint: 'a' }),
  ];
  const input = {
    context: contextFixture(),
    contradictions,
    configuration: createAIDetectiveConfiguration(),
    hasher,
  };
  const first = createDetectiveReport(input);
  const second = createDetectiveReport({ ...input, contradictions: [...contradictions].reverse() });
  assert.deepEqual(first.findings.map(({ contradiction }) => contradiction.id), ['a', 'z']);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.findings), true);
});

test('quality helper distinguishes clear, recommended, required, and blocked states', () => {
  const configuration = createAIDetectiveConfiguration();
  const reportFor = (contradictions: Parameters<typeof createDetectiveReport>[0]['contradictions']) => (
    createDetectiveReport({ context: contextFixture(), contradictions, configuration, hasher })
  );
  assert.equal(evaluateDetectiveQualityStatus(reportFor([])).status, 'CLEAR');
  assert.equal(evaluateDetectiveQualityStatus(reportFor([
    contradictionFixture({ severity: 'LOW' }),
  ])).status, 'REVIEW_RECOMMENDED');
  assert.equal(evaluateDetectiveQualityStatus(reportFor([
    contradictionFixture({ severity: 'HIGH' }),
  ])).status, 'REVIEW_REQUIRED');
  assert.equal(evaluateDetectiveQualityStatus(reportFor([
    contradictionFixture({ type: 'IMPOSSIBLE_COMBINATION', severity: 'CRITICAL' }),
  ])).status, 'BLOCKED');
});
