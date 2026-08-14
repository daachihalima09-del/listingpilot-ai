import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canonicalGenerationEligibility,
  createListingGenerationPlan,
  createPersistedProductTruthReport,
} from '../index.ts';
import { generationInput, finding, truthFindings } from './fixtures.ts';

test('warnings and review-only facts allow conservative generation', () => {
  const likely = finding('material', 'Aluminium', 'LIKELY');
  const plan = createListingGenerationPlan(generationInput({
    findings: [...truthFindings(), likely],
    mutate: (input) => {
      (input.aiPolicy as { factualStrictness: string }).factualStrictness = 'VERIFIED_AND_LIKELY_WITH_LABEL';
    },
  }));
  assert.equal(plan.generationStatus, 'READY_WITH_WARNINGS');
  assert.equal(plan.generationEligibility.allowed, true);
  assert.equal(plan.selectedFacts.some(({ fieldId }) => fieldId === 'material'), false);
  assert.equal(plan.reviewRequirements.find(({ type }) => type === 'FACT_REVIEW')?.blocking, false);
});

test('low readiness from optional images, variants and category fields does not block', () => {
  const plan = createListingGenerationPlan(generationInput({
    mutate: (input) => {
      (input.product as unknown as { media: unknown[] }).media = [];
      (input.product as unknown as { variants: unknown[] }).variants = [];
      (input.productIntelligence.analysis!.categoryRequirements as unknown as {
        missingCategoryFields: string[];
        missingRecommendedFields: string[];
      }).missingCategoryFields = ['filter_type'];
      (input.productIntelligence.analysis!.categoryRequirements as unknown as {
        missingCategoryFields: string[];
        missingRecommendedFields: string[];
      }).missingRecommendedFields = ['room_coverage'];
    },
  }));
  assert.equal(plan.generationEligibility.allowed, true);
  assert.deepEqual(
    new Set(plan.warnings.map(({ code }) => code)),
    new Set(['MISSING_OPTIONAL_IMAGES', 'MISSING_OPTIONAL_VARIANTS', 'MISSING_OPTIONAL_CATEGORY_FACTS']),
  );
});

test('critical Product Truth conflicts and policy blockers remain hard stops', () => {
  const conflict = finding('model', 'TP09', 'CONFLICTED', { importance: 'CRITICAL' });
  const conflictPlan = createListingGenerationPlan(generationInput({
    findings: [...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'), conflict],
  }));
  assert.equal(conflictPlan.generationEligibility.allowed, false);
  assert.equal(conflictPlan.blockers.some(({ code }) => code === 'CRITICAL_TRUTH_CONFLICT'), true);

  const policyPlan = createListingGenerationPlan(generationInput({
    pack: null,
    mutate: (input) => {
      const policy = input.publishingPolicy.blockerPolicy
        .find(({ condition }) => condition === 'MISSING_PRODUCT_INTELLIGENCE_PACK')!;
      (policy as { outcome: string }).outcome = 'BLOCK';
    },
  }));
  assert.equal(policyPlan.generationEligibility.allowed, false);
  assert.equal(policyPlan.blockers.some(({ code }) => code === 'PUBLISHING_POLICY_BLOCK'), true);
});

test('canonical eligibility exposes exact merchant-readable blockers and warnings', () => {
  const conflict = finding('model', 'TP09', 'CONFLICTED', {
    importance: 'CRITICAL',
    explanation: 'Model evidence contains both TP12 and TP09.',
  });
  const result = canonicalGenerationEligibility(createListingGenerationPlan(generationInput({
    findings: [...truthFindings().filter(({ fieldPath }) => fieldPath !== 'model'), conflict],
  })));
  assert.equal(result.canGenerate, false);
  assert.equal(result.blockingFindings.some(({ explanation }) => /Critical Product Truth conflicts/iu.test(explanation)), true);
  assert.equal(result.blockingFindings.some(({ fieldIds }) => fieldIds.includes('model')), true);
  assert.equal(result.blockingFindings.every(({ resolutionArea }) => Boolean(resolutionArea)), true);
});

test('canonical warnings use merchant language while retaining diagnostic codes', () => {
  const result = canonicalGenerationEligibility(createListingGenerationPlan(generationInput({ pack: null })));
  const categoryWarning = result.warnings.find(({ code }) => code === 'MISSING_PRODUCT_INTELLIGENCE_PACK');
  assert.equal(categoryWarning?.title, 'Category-specific guidance unavailable');
  assert.equal(categoryWarning?.explanation, 'Generic verified-fact generation rules will be used for this product.');
  assert.equal(result.canGenerate, true);
});

test('sparse verified identity generates safely while optional facts and static demo identity are ignored', () => {
  for (const listingStandard of ['NEOVIX', 'MINIMAL'] as const) {
    const plan = createListingGenerationPlan(generationInput({
      listingStandard,
      pack: null,
      findings: [finding('brand', 'Dyson'), finding('model', 'TP12')],
      mutate: (input) => {
        (input.product as { title: string }).title = 'Samsung demo television';
        (input.product as { attributes: Record<string, unknown> }).attributes = { brand: 'Samsung' };
        (input.product as unknown as { media: unknown[] }).media = [];
        (input.product as unknown as { variants: unknown[] }).variants = [];
      },
    }));
    assert.equal(plan.generationEligibility.allowed, true);
    assert.deepEqual(new Set(plan.selectedFacts.map(({ fieldId }) => fieldId)), new Set(['brand', 'model']));
    assert.equal(JSON.stringify(plan.selectedFacts).includes('Samsung'), false);
  }
});

test('persisted Product Truth status is preserved without lossy re-analysis or static field leakage', () => {
  const now = new Date('2026-08-11T10:00:00.000Z');
  const report = createPersistedProductTruthReport({
    id: '00000000-0000-4000-8000-000000000002',
    workspaceId: '00000000-0000-4000-8000-000000000001',
    name: 'Dyson QA',
    status: 'READY',
    sourceType: 'PRODUCT_URL',
    sourceUrl: 'https://example.com/dyson-tp12',
    readiness: { shopifyReady: false, score: 38 },
    version: 4,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    rawInput: null,
    generatedListing: null,
    seoData: null,
    readinessData: { analysisStarted: true, activeStage: 'verify', completedStages: ['input', 'extract', 'verify'], shopifyReady: false },
    analysisData: {
      activeProduct: {
        brand: 'Dyson', model: 'TP12', panel: 'Missing', hdr: 'Missing', refreshRate: 'Missing', resolution: 'Missing', smartPlatform: 'MyDyson App', warranty: 'Missing',
        truthRows: [], sources: [],
        conflict: { label: '', official: '', amazon: '', lg: '', recommendation: '', recommendedValue: '', explanation: 'No conflicts.' },
        catalogHealth: { score: 38, label: 'Needs review', items: [] }, analyses: [],
      },
      truthRows: [
        { field: 'brand', value: 'Dyson', source: 'Product page', sourcesCount: 1, confidence: 100, status: 'Verified', reasoning: 'Directly stated.' },
        { field: 'model', value: 'TP12', source: 'Product page', sourcesCount: 1, confidence: 100, status: 'Verified', reasoning: 'Directly stated.' },
        { field: 'panel', value: 'Missing', source: 'Not provided', sourcesCount: 0, confidence: 0, status: 'Missing', reasoning: 'Not applicable.' },
      ],
      analysisContext: { sourceLabel: 'Product URL', notice: 'Saved analysis' },
      conflictResolved: false,
    },
  });
  assert.equal(report.findings.find(({ fieldPath }) => fieldPath === 'brand')?.status, 'VERIFIED');
  assert.equal(report.findings.find(({ fieldPath }) => fieldPath === 'model')?.status, 'VERIFIED');
  assert.equal(report.findings.find(({ fieldPath }) => fieldPath === 'panel')?.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(report.findings.some(({ selectedValue }) => selectedValue?.includes('Samsung')), false);
});

test('missing minimum verified identity remains blocked and cannot be bypassed by a client title', () => {
  const plan = createListingGenerationPlan(generationInput({
    pack: null,
    findings: [finding('filter_type', 'HEPA', 'LIKELY')],
    mutate: (input) => { (input.product as { title: string }).title = 'Looks complete'; },
  }));
  assert.equal(plan.generationEligibility.allowed, false);
  assert.equal(plan.blockers.some(({ code }) => code === 'MISSING_REQUIRED_TRUTH'), true);
});

test('eligibility is deterministic across serialization and all product surfaces use the canonical result', async () => {
  const first = canonicalGenerationEligibility(createListingGenerationPlan(generationInput()));
  const second = canonicalGenerationEligibility(createListingGenerationPlan(generationInput()));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  const [workspace, page, service] = await Promise.all([
    readFile(new URL('../../../components/workspace/ListingWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../app/workspace/[projectId]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../listing-draft/persistence/project-draft-service.server.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /canonicalGenerationEligibility/);
  assert.match(workspace, /generationEligibility\?\.canGenerate/);
  assert.match(workspace, /canGenerateListing/);
  assert.match(workspace, /GenerationEligibilityPanel/);
  assert.match(service, /if \(!context\.eligibility\.canGenerate\)/);
  assert.ok(service.indexOf('if (!context.eligibility.canGenerate)') < service.indexOf('generateAndPersistListingDraft({'));
});
