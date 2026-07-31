import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Evidence } from '../domain/types.ts';
import { DeterministicHasher } from '../deterministic/services.ts';
import { suppressDuplicateIssues } from '../issues/suppression.ts';
import { CapabilityPackRegistry } from '../packs/capability.ts';
import {
  analyzeTruth,
  truthContextFixture,
  truthEvidenceFixture,
} from '../testing/product-truth-fixtures.ts';
import { createProductTruthCapabilityPack } from './capability.ts';
import {
  createProductTruthConfiguration,
  PRODUCT_TRUTH_CAPABILITY_ID,
  PRODUCT_TRUTH_VERSION,
} from './configuration.ts';
import { createProductTruthBundle } from './factory.ts';
import { PRODUCT_TRUTH_ISSUE_CODES } from './issues.ts';
import { evaluateProductTruthQualityStatus } from './quality-status.ts';

function evidence(
  id: string,
  value: unknown,
  metadata: Readonly<Record<string, unknown>> = {},
  overrides: Partial<Evidence> = {},
): Evidence {
  const base = truthEvidenceFixture(id, value);
  return { ...base, ...overrides, metadata: { ...base.metadata, ...metadata } };
}

function titleIssue(records: readonly Evidence[], code: string) {
  const analysis = analyzeTruth(records);
  return {
    analysis,
    issue: analysis.issues.find((item) => item.code === code
      && item.affectedFields.includes('title')),
  };
}

test('Product Truth capability has stable source-independent metadata and no mandatory Knowledge Pack', () => {
  const capability = createProductTruthCapabilityPack();
  assert.equal(capability.id, PRODUCT_TRUTH_CAPABILITY_ID);
  assert.equal(capability.version, PRODUCT_TRUTH_VERSION);
  assert.deepEqual(capability.dependencies, []);
  assert.equal(capability.compatibilityMetadata.sourceIndependent, true);
  assert.equal(capability.compatibilityMetadata.knowledgePackOptional, true);
  assert.equal(capability.extensionMetadata.evidenceRequirement, 'SUPPLIED_ONLY');
});

test('Product Truth capability registers through the existing capability registry', () => {
  const registry = new CapabilityPackRegistry();
  registry.register(createProductTruthCapabilityPack());
  assert.deepEqual(registry.resolve().map(({ id }) => id), ['product-truth']);
});

test('bundle exposes configuration, registries, analyzer, detector, confidence, and recommendations explicitly', () => {
  const bundle = createProductTruthBundle({ hasher: new DeterministicHasher() });
  assert.equal(bundle.capabilityPack.id, 'product-truth');
  assert.equal(bundle.detectors[0].metadata.id, 'product-truth.analysis');
  assert.equal(bundle.extractorRegistry.ordered().length, 2);
  assert.equal(bundle.resolutionStrategyRegistry.ordered().length, 7);
  assert.equal(bundle.recommendationStrategy.id, 'product-truth.review-guidance');
  assert.equal(Object.isFrozen(bundle), true);
});

test('bundle accepts an explicit future Knowledge Pack comparison strategy without global mutation', () => {
  const comparison = {
    id: 'test-pack.comparison',
    version: '1.0.0',
    compare: () => ({
      result: 'INCOMPARABLE' as const,
      explanation: 'Test-only Knowledge Pack extension.',
      confidenceImpact: 0,
      metadata: {},
    }),
  };
  const first = createProductTruthBundle({
    hasher: new DeterministicHasher(),
    comparisonStrategy: comparison,
  });
  const second = createProductTruthBundle({ hasher: new DeterministicHasher() });
  assert.equal(first.comparisonStrategy.id, 'test-pack.comparison');
  assert.equal(second.comparisonStrategy.id, 'truth-value.generic');
});

test('conflicted claim issue includes complete group, evidence, detector, and review traceability', () => {
  const { issue } = titleIssue([
    evidence('retailer-a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'a' }),
    evidence('retailer-b', 'Different', { providerType: 'RETAILER', sourceIdentity: 'b' }),
  ], 'truth.claim.conflicted');
  assert.ok(issue);
  assert.equal(typeof issue.metadata.claimGroupId, 'string');
  assert.equal(issue.metadata.resolutionStatus, 'CONFLICTED');
  assert.equal(issue.metadata.reviewRequirement, 'REQUIRED');
  assert.equal(issue.metadata.capabilityVersion, '1.0.0');
  assert.deepEqual(issue.affectedProductIds, ['product-1']);
  assert.deepEqual(issue.affectedFields, ['title']);
  assert.equal(issue.evidenceIds.length, 2);
});

test('unresolved, insufficient, missing-provenance, low-confidence, and override issues use stable codes', () => {
  const weak = titleIssue([
    evidence('weak', 'Generic product', {
      authorityLevel: 'UNKNOWN',
      sourceIdentity: 'weak',
    }, { reliability: 'LOW', freshness: 0.1 }),
  ], 'truth.claim.unresolved').issue;
  const insufficient = titleIssue([], 'truth.evidence.insufficient').issue;
  const noSource = evidence('no-source', 'Generic product', { sourceIdentity: undefined }, {
    sourceReference: undefined,
  });
  const provenance = titleIssue([noSource], 'truth.evidence.provenance_missing').issue;
  const lowConfidenceAnalysis = analyzeTruth([
    evidence('retailer', 'Generic product', {
      providerType: 'RETAILER',
      sourceIdentity: 'retailer',
    }),
  ], {
    configuration: { lowConfidenceIssueThreshold: 0.96 },
  });
  const lowConfidence = lowConfidenceAnalysis.issues.find((item) => (
    item.code === 'truth.resolution.low_confidence' && item.affectedFields.includes('title')
  ));
  const override = titleIssue([
    evidence('override', 'Merchant', { merchantApprovedOverride: true, sourceIdentity: 'merchant' }),
    evidence('official-a', 'Generic product', { sourceIdentity: 'official-a' }),
    evidence('official-b', 'Generic product', { sourceIdentity: 'official-b' }),
  ], 'truth.override.conflicted').issue;
  assert.deepEqual(
    [weak, insufficient, provenance, lowConfidence, override].map((issue) => issue?.code),
    [
      'truth.claim.unresolved',
      'truth.evidence.insufficient',
      'truth.evidence.provenance_missing',
      'truth.resolution.low_confidence',
      'truth.override.conflicted',
    ],
  );
});

test('complete Product Truth issue-code registry remains stable', () => {
  assert.deepEqual(PRODUCT_TRUTH_ISSUE_CODES, [
    'truth.claim.conflicted',
    'truth.claim.unresolved',
    'truth.evidence.insufficient',
    'truth.evidence.provenance_missing',
    'truth.resolution.low_confidence',
    'truth.override.conflicted',
  ]);
});

test('verified title finding emits no unnecessary title issue', () => {
  const analysis = analyzeTruth([
    evidence('source-a', 'Generic product', { sourceIdentity: 'a' }),
    evidence('source-b', 'Generic product', { sourceIdentity: 'b' }),
  ]);
  const titleFinding = analysis.report.findings.find(({ fieldPath }) => fieldPath === 'title');
  assert.equal(titleFinding?.status, 'VERIFIED');
  assert.equal(analysis.issues.some(({ affectedFields }) => affectedFields.includes('title')), false);
});

test('Product Truth issues are compatible with existing semantic duplicate suppression', () => {
  const { analysis, issue } = titleIssue([
    evidence('retailer-a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'a' }),
    evidence('retailer-b', 'Different', { providerType: 'RETAILER', sourceIdentity: 'b' }),
  ], 'truth.claim.conflicted');
  assert.ok(issue);
  const suppressed = suppressDuplicateIssues({
    issues: [issue, { ...issue, id: `${issue.id}-copy` }],
    evidence: truthContextFixture([
      evidence('retailer-a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'a' }),
      evidence('retailer-b', 'Different', { providerType: 'RETAILER', sourceIdentity: 'b' }),
    ]).evidence,
    hasher: new DeterministicHasher(),
  });
  assert.equal(suppressed.issues.length, 1);
  assert.equal(suppressed.suppressedCount, 1);
  assert.equal(analysis.issues.length > 0, true);
});

test('recommendations are deterministic, approval-gated, traceable, and contain no replacement fact', () => {
  const hasher = new DeterministicHasher();
  const bundle = createProductTruthBundle({ hasher });
  const { analysis, issue } = titleIssue([
    evidence('retailer-a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'a' }),
    evidence('retailer-b', 'Different', { providerType: 'RETAILER', sourceIdentity: 'b' }),
  ], 'truth.claim.conflicted');
  assert.ok(issue);
  const first = bundle.recommendationStrategy.recommend([issue], truthContextFixture());
  const second = bundle.recommendationStrategy.recommend([issue], truthContextFixture());
  assert.deepEqual(first, second);
  assert.equal(first[0].issueIds[0], issue.id);
  assert.equal(first[0].metadata.claimGroupId, issue.metadata.claimGroupId);
  assert.equal(first[0].approvalRequirement, 'MERCHANT');
  assert.equal(first[0].automationCapability, 'SUGGEST_ONLY');
  assert.deepEqual(first[0].proposedValues, []);
  assert.equal(first[0].id, analysis.report.findings.find(({ fieldPath }) => (
    fieldPath === 'title'
  ))?.associatedRecommendationIds[0]);
});

test('recommendation guidance varies safely by issue condition', () => {
  const bundle = createProductTruthBundle({ hasher: new DeterministicHasher() });
  const insufficient = titleIssue([], 'truth.evidence.insufficient').issue;
  const provenance = titleIssue([
    evidence('no-source', 'Generic product', { sourceIdentity: undefined }, { sourceReference: undefined }),
  ], 'truth.evidence.provenance_missing').issue;
  assert.ok(insufficient);
  assert.ok(provenance);
  const recommendations = bundle.recommendationStrategy.recommend(
    [insufficient, provenance],
    truthContextFixture(),
  );
  assert.equal(recommendations.some(({ explanation }) => explanation.includes('official manufacturer')), true);
  assert.equal(recommendations.some(({ explanation }) => explanation.includes('source reference')), true);
});

test('manual confirmation and override-review guidance never generates a factual replacement', () => {
  const bundle = createProductTruthBundle({ hasher: new DeterministicHasher() });
  const unresolved = titleIssue([
    evidence('weak', 'Generic product', {
      authorityLevel: 'UNKNOWN',
      sourceIdentity: 'weak',
    }, { reliability: 'LOW', freshness: 0.1 }),
  ], 'truth.claim.unresolved').issue;
  const override = titleIssue([
    evidence('override', 'Merchant', { merchantApprovedOverride: true, sourceIdentity: 'merchant' }),
    evidence('official-a', 'Generic product', { sourceIdentity: 'official-a' }),
    evidence('official-b', 'Generic product', { sourceIdentity: 'official-b' }),
  ], 'truth.override.conflicted').issue;
  assert.ok(unresolved);
  assert.ok(override);
  const recommendations = bundle.recommendationStrategy.recommend(
    [unresolved, override],
    truthContextFixture(),
  );
  assert.equal(recommendations.some(({ explanation }) => explanation.includes('Confirm the claim manually')), true);
  assert.equal(recommendations.some(({ explanation }) => explanation.includes('merchant override')), true);
  assert.equal(recommendations.every(({ proposedValues }) => proposedValues.length === 0), true);
});

test('truth-quality status reports NO_EVIDENCE for normalized claims without supplied evidence', () => {
  const analysis = analyzeTruth([]);
  const status = evaluateProductTruthQualityStatus(
    analysis.report,
    createProductTruthConfiguration(),
  );
  assert.equal(status.status, 'NO_EVIDENCE');
});

test('truth-quality status reports TRUSTED for fully evidenced minimal claim scope', () => {
  const analysis = analyzeTruth([
    evidence('a', 'Generic product', { sourceIdentity: 'a' }),
    evidence('b', 'Generic product', { sourceIdentity: 'b' }),
  ], {
    context: {
      products: [{
        ...truthContextFixture().products[0],
        description: undefined,
        vendor: undefined,
        productType: undefined,
        status: undefined,
        seo: { evidenceIds: [] },
      }],
    },
  });
  const status = evaluateProductTruthQualityStatus(
    analysis.report,
    createProductTruthConfiguration(),
  );
  assert.equal(status.status, 'TRUSTED');
});

test('truth-quality status distinguishes recommended, required, and blocked review', () => {
  const likely = analyzeTruth([
    evidence('one', 'Generic product', { sourceIdentity: 'one' }),
  ]);
  const conflictRecords = [
    evidence('a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'a' }),
    evidence('b', 'Different', { providerType: 'RETAILER', sourceIdentity: 'b' }),
  ];
  const conflict = analyzeTruth(conflictRecords);
  const blocked = analyzeTruth(conflictRecords, {
    configuration: { blockingImportances: ['HIGH', 'CRITICAL'] },
  });
  assert.equal(evaluateProductTruthQualityStatus(
    likely.report,
    createProductTruthConfiguration(),
  ).status, 'REVIEW_RECOMMENDED');
  assert.equal(evaluateProductTruthQualityStatus(
    conflict.report,
    createProductTruthConfiguration(),
  ).status, 'REVIEW_REQUIRED');
  assert.equal(evaluateProductTruthQualityStatus(
    blocked.report,
    createProductTruthConfiguration({ blockingImportances: ['HIGH', 'CRITICAL'] }),
  ).status, 'BLOCKED');
});

test('truth-quality result is deterministic and immutable', () => {
  const analysis = analyzeTruth([]);
  const configuration = createProductTruthConfiguration();
  const first = evaluateProductTruthQualityStatus(analysis.report, configuration);
  const second = evaluateProductTruthQualityStatus(analysis.report, configuration);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
});
