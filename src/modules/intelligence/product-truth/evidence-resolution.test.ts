import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Evidence } from '../domain/types.ts';
import {
  analyzeTruth,
  truthEvidenceFixture,
} from '../testing/product-truth-fixtures.ts';
import {
  createDefaultProductTruthResolutionStrategyRegistry,
  UnresolvedTruthStrategy,
} from './resolution.ts';

function evidence(
  id: string,
  value: unknown,
  metadata: Readonly<Record<string, unknown>> = {},
  overrides: Partial<Evidence> = {},
): Evidence {
  const base = truthEvidenceFixture(id, value);
  return {
    ...base,
    ...overrides,
    metadata: { ...base.metadata, ...metadata },
  };
}

function titleFinding(records: readonly Evidence[]) {
  const analysis = analyzeTruth(records);
  const finding = analysis.report.findings.find(({ fieldPath }) => fieldPath === 'title');
  assert.ok(finding);
  return { analysis, finding };
}

test('official structured evidence from independent sources can verify exact consensus', () => {
  const { finding } = titleFinding([
    evidence('manufacturer-page', 'Generic product', { sourceIdentity: 'manufacturer-page' }),
    evidence('manufacturer-feed', 'Generic product', { sourceIdentity: 'manufacturer-feed' }),
  ]);
  assert.equal(finding.status, 'VERIFIED');
  assert.equal(finding.selectedValue, 'Generic product');
  assert.equal(finding.evidenceSummary.independentSourceCount, 2);
  assert.equal(finding.reviewRequirement, 'NONE');
});

test('one authoritative source produces likely rather than verified truth', () => {
  const { finding } = titleFinding([
    evidence('manufacturer', 'Generic product'),
  ]);
  assert.equal(finding.status, 'LIKELY');
  assert.equal(finding.confidenceMeaning, 'SELECTED_CANDIDATE');
});

test('manufacturer documents are evaluated below structured manufacturer evidence', () => {
  const { analysis } = titleFinding([
    evidence('document', 'Generic product', {
      providerType: 'MANUFACTURER',
      structured: false,
      authorityLevel: 'MANUFACTURER_DOCUMENT',
    }),
  ]);
  const title = analysis.groups.find(({ affectedFieldPath }) => affectedFieldPath === 'title');
  assert.equal(title?.candidates[0].authoritySummary.strongestLevel, 'MANUFACTURER_DOCUMENT');
});

test('retailer and human-reviewed evidence retain explicit authority summaries', () => {
  const retailer = titleFinding([
    evidence('retailer', 'Generic product', { providerType: 'RETAILER' }),
  ]).analysis.groups.find(({ affectedFieldPath }) => affectedFieldPath === 'title');
  const human = titleFinding([
    evidence('human', 'Generic product', { providerType: 'HUMAN' }, { type: 'HUMAN_REVIEW' }),
  ]).analysis.groups.find(({ affectedFieldPath }) => affectedFieldPath === 'title');
  assert.equal(retailer?.candidates[0].authoritySummary.strongestLevel, 'RETAILER_STRUCTURED');
  assert.equal(human?.candidates[0].authoritySummary.strongestLevel, 'HUMAN_REVIEWED');
});

test('AI-derived evidence alone cannot verify a candidate', () => {
  const { finding } = titleFinding([
    evidence('ai', 'Generic product', {
      providerType: 'AI_DERIVED',
    }, {
      type: 'DERIVED_INTERPRETATION',
      reliability: 'HIGH',
    }),
  ]);
  assert.notEqual(finding.status, 'VERIFIED');
  assert.equal(finding.confidence.factors.some(({ code }) => code === 'RESPONSIBLE_NON_SELECTION'), true);
});

test('merchant listing evidence alone cannot verify itself', () => {
  const { finding } = titleFinding([
    evidence('merchant', 'Generic product', {
      providerType: 'MERCHANT',
    }, {
      reliability: 'HIGH',
    }),
  ]);
  assert.notEqual(finding.status, 'VERIFIED');
  assert.equal(finding.confidence.value <= 0.59, true);
});

test('missing provenance applies a confidence ceiling and creates traceable uncertainty', () => {
  const record = evidence('no-source', 'Generic product', {
    sourceIdentity: undefined,
  }, {
    sourceReference: undefined,
  });
  const { analysis, finding } = titleFinding([record]);
  assert.equal(finding.confidence.value <= 0.55 || finding.confidenceMeaning === 'RESOLUTION_STATUS', true);
  assert.equal(finding.evidenceSummary.missingProvenanceCount, 1);
  assert.equal(analysis.issues.some(({ code }) => code === 'truth.evidence.provenance_missing'), true);
});

test('stale evidence is visible in candidate freshness summaries', () => {
  const { analysis } = titleFinding([
    evidence('stale', 'Generic product', {}, { freshness: 0.1 }),
  ]);
  const candidate = analysis.groups.find(({ affectedFieldPath }) => (
    affectedFieldPath === 'title'
  ))?.candidates[0];
  assert.equal(candidate?.freshnessSummary.staleEvidenceCount, 1);
  assert.equal(candidate?.freshnessSummary.minimum, 0.1);
});

test('duplicate evidence from the same source does not inflate source diversity', () => {
  const { analysis, finding } = titleFinding([
    evidence('copy-1', 'Generic product', { sourceIdentity: 'same-source' }),
    evidence('copy-2', 'Generic product', { sourceIdentity: 'same-source' }),
  ]);
  const candidate = analysis.groups.find(({ affectedFieldPath }) => (
    affectedFieldPath === 'title'
  ))?.candidates[0];
  assert.equal(candidate?.evidenceCount, 2);
  assert.equal(candidate?.sourceCount, 1);
  assert.equal(candidate?.metadata.duplicateEvidenceCount, 1);
  assert.notEqual(finding.status, 'VERIFIED');
});

test('independent-source diversity is an explicit confidence factor', () => {
  const { finding } = titleFinding([
    evidence('source-a', 'Generic product', { sourceIdentity: 'source-a' }),
    evidence('source-b', 'Generic product', { sourceIdentity: 'source-b' }),
  ]);
  const diversity = finding.confidence.factors.find(({ code }) => code === 'INDEPENDENT_SOURCE_DIVERSITY');
  assert.equal((diversity?.contribution ?? 0) > 0, true);
  assert.equal(diversity?.metadata.sourceCount, 2);
});

test('materially supported disagreement resolves as conflict without selecting a value', () => {
  const { finding } = titleFinding([
    evidence('retailer-a', 'Generic product', { providerType: 'RETAILER', sourceIdentity: 'retailer-a' }),
    evidence('retailer-b', 'Different product', { providerType: 'RETAILER', sourceIdentity: 'retailer-b' }),
  ]);
  assert.equal(finding.status, 'CONFLICTED');
  assert.equal(finding.selectedValue, undefined);
  assert.equal(finding.confidenceMeaning, 'RESOLUTION_STATUS');
  assert.equal(finding.reviewRequirement, 'REQUIRED');
});

test('authority-weighted consensus can select a dominant candidate while preserving disagreement', () => {
  const { finding } = titleFinding([
    evidence('manufacturer-a', 'Generic product', { sourceIdentity: 'manufacturer-a' }),
    evidence('manufacturer-b', 'Generic product', { sourceIdentity: 'manufacturer-b' }),
    evidence('weak', 'Different product', {
      providerType: 'OTHER',
      authorityLevel: 'UNKNOWN',
      sourceIdentity: 'weak',
    }, {
      reliability: 'LOW',
      freshness: 0.2,
    }),
  ]);
  assert.equal(['VERIFIED', 'LIKELY'].includes(finding.status), true);
  assert.equal(finding.selectedValue, 'Generic product');
  assert.equal(finding.conflictSummary.conflictingEvidenceCount > 0, true);
});

test('explicit merchant override remains visibly marked and retains stronger conflict', () => {
  const { analysis, finding } = titleFinding([
    evidence('override', 'Merchant value', {
      providerType: 'MERCHANT',
      merchantApprovedOverride: true,
      sourceIdentity: 'merchant',
    }),
    evidence('official-a', 'Generic product', { sourceIdentity: 'official-a' }),
    evidence('official-b', 'Generic product', { sourceIdentity: 'official-b' }),
  ]);
  assert.equal(finding.status, 'MERCHANT_OVERRIDE');
  assert.equal(finding.selectedValue, 'Merchant value');
  assert.equal(finding.reviewRequirement, 'REQUIRED');
  assert.equal(finding.confidence.factors.some(({ code }) => code === 'MERCHANT_APPROVED_OVERRIDE'), true);
  assert.equal(analysis.issues.some(({ code }) => code === 'truth.override.conflicted'), true);
});

test('multiple different merchant overrides become conflicted instead of choosing the first', () => {
  const { finding } = titleFinding([
    evidence('override-a', 'First', { merchantApprovedOverride: true, sourceIdentity: 'merchant-a' }),
    evidence('override-b', 'Second', { merchantApprovedOverride: true, sourceIdentity: 'merchant-b' }),
  ]);
  assert.equal(finding.status, 'CONFLICTED');
  assert.equal(finding.selectedValue, undefined);
});

test('no supplied evidence produces insufficient-evidence findings without fabricated values', () => {
  const { finding } = titleFinding([]);
  assert.equal(finding.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(finding.selectedValue, undefined);
  assert.equal(finding.confidenceMeaning, 'RESOLUTION_STATUS');
});

test('future Knowledge Pack evidence-type requirements can prevent premature resolution', () => {
  const analysis = analyzeTruth([
    evidence('structured', 'Generic product'),
  ], {
    configuration: {
      requiredEvidenceTypes: {
        'product.title': ['DOCUMENT_CLAIM'],
      },
    },
  });
  const finding = analysis.report.findings.find(({ fieldPath }) => fieldPath === 'title');
  assert.equal(finding?.status, 'INSUFFICIENT_EVIDENCE');
});

test('weak usable evidence falls through to unresolved rather than unsafe selection', () => {
  const { finding } = titleFinding([
    evidence('weak', 'Generic product', {
      authorityLevel: 'UNKNOWN',
      providerType: 'OTHER',
    }, {
      reliability: 'LOW',
      freshness: 0.1,
    }),
  ]);
  assert.equal(finding.status, 'UNRESOLVED');
  assert.equal(finding.selectedValue, undefined);
});

test('incomparable units remain unresolved instead of becoming a guessed conflict or selection', () => {
  const analysis = analyzeTruth([
    evidence('unit-a', '120', {
      claimNamespace: 'generic',
      claimKey: 'measurement',
      affectedFieldPath: 'attributes.measurement',
      valueType: 'DECIMAL',
      unit: 'hz',
      sourceIdentity: 'unit-a',
    }),
    evidence('unit-b', '120', {
      claimNamespace: 'generic',
      claimKey: 'measurement',
      affectedFieldPath: 'attributes.measurement',
      valueType: 'DECIMAL',
      unit: 'rpm',
      sourceIdentity: 'unit-b',
    }),
  ]);
  const finding = analysis.report.findings.find(({ fieldPath }) => fieldPath === 'attributes.measurement');
  assert.equal(finding?.status, 'UNRESOLVED');
  assert.equal(finding?.selectedValue, undefined);
});

test('explicit not-applicable structured metadata has an active status', () => {
  const { finding } = titleFinding([
    evidence('not-applicable', 'Generic product', { notApplicable: true }),
  ]);
  assert.equal(finding.status, 'NOT_APPLICABLE');
  assert.equal(finding.reviewRequirement, 'NONE');
});

test('resolution strategy registry ordering, disabling, and duplicate protection are explicit', () => {
  const registry = createDefaultProductTruthResolutionStrategyRegistry();
  const ordered = registry.ordered();
  assert.deepEqual(
    ordered.map(({ priority }) => priority),
    [...ordered.map(({ priority }) => priority)].sort((left, right) => left - right),
  );
  registry.disable('product-truth.exact-consensus');
  assert.equal(registry.ordered().some(({ id }) => id === 'product-truth.exact-consensus'), false);
  registry.enable('product-truth.exact-consensus');
  assert.throws(() => registry.register(new UnresolvedTruthStrategy()));
});

test('same evidence produces identical resolution and confidence factors', () => {
  const records = [
    evidence('source-a', 'Generic product', { sourceIdentity: 'source-a' }),
    evidence('source-b', 'Generic product', { sourceIdentity: 'source-b' }),
  ];
  const first = titleFinding(records).finding;
  const second = titleFinding(records).finding;
  assert.equal(first.status, second.status);
  assert.equal(first.selectedValue, second.selectedValue);
  assert.deepEqual(first.confidence, second.confidence);
  assert.equal(first.deterministicFingerprint, second.deterministicFingerprint);
});
