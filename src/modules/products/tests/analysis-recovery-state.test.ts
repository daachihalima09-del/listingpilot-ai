import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveProductWork, sourceHasChanged } from '../analysis/analysis-state.ts';
import type { ProjectSaveSnapshot } from '../../projects/client/use-project-autosave.ts';

function savedProduct(model = 'A100'): ProjectSaveSnapshot {
  const truthRows = [{ field: 'Model', value: model, source: 'Merchant product information', sourcesCount: 1, confidence: 90, status: 'Verified' as const }];
  return {
    sourceType: 'PRODUCT_URL',
    sourceUrl: `https://manufacturer.example/products/${model.toLowerCase()}`,
    rawInput: null,
    analysisData: {
      activeProduct: {
        brand: 'Synthetic', model, panel: '', hdr: '', refreshRate: '', resolution: '', smartPlatform: '', warranty: '',
        truthRows, sources: [],
        conflict: { label: '', official: '', amazon: '', lg: '', recommendation: '', recommendedValue: '', explanation: '' },
        catalogHealth: { score: 90, label: 'Good', items: [] }, analyses: [],
      },
      truthRows, analysisContext: { sourceLabel: 'Product URL', notice: 'Saved source analysis.' }, conflictResolved: true,
    },
    generatedListing: { title: `Synthetic ${model}`, description: 'Previously saved authoritative listing.', keyFeatures: 'Previously saved features.' },
    seoData: { seoTitle: `Synthetic ${model}`, seoDescription: 'Previously saved SEO.', tags: 'saved' },
    readinessData: { analysisStarted: true, activeStage: 'review', completedStages: ['input', 'extract', 'verify', 'generate'], shopifyReady: true },
  };
}

test('URL replacement retains the saved analysis, listing and SEO while marking evidence pending', () => {
  const existing = savedProduct();
  const next = { ...existing, sourceUrl: 'https://manufacturer.example/products/replacement', analysisData: null, generatedListing: null, seoData: null };
  const result = preserveProductWork(existing, next);
  assert.equal(result.analysisData, existing.analysisData);
  assert.equal(result.generatedListing, existing.generatedListing);
  assert.equal(result.seoData, existing.seoData);
  assert.equal(result.sourceUrl, next.sourceUrl);
  assert.equal(result.readinessData?.analysisPending, true);
  assert.equal(result.readinessData?.shopifyReady, false);
});

test('switching to pasted information preserves the same Product work and blocks old evidence', () => {
  const existing = savedProduct();
  const next: ProjectSaveSnapshot = { ...existing, sourceType: 'RAW_SPECIFICATIONS', sourceUrl: null, rawInput: 'Merchant replacement information', analysisData: null, generatedListing: null, seoData: null };
  const result = preserveProductWork(existing, next);
  assert.equal(result.analysisData, existing.analysisData);
  assert.equal(result.generatedListing, existing.generatedListing);
  assert.equal(result.rawInput, next.rawInput);
  assert.equal(result.readinessData?.analysisPending, true);
});

test('editing pasted information preserves prior work and identifies changed source evidence', () => {
  const existing = { ...savedProduct(), sourceType: 'RAW_SPECIFICATIONS' as const, sourceUrl: null, rawInput: 'Saved merchant information' };
  const next = { ...existing, rawInput: 'Edited merchant information', analysisData: null, generatedListing: null };
  const result = preserveProductWork(existing, next);
  assert.equal(sourceHasChanged(existing, next), true);
  assert.equal(result.analysisData, existing.analysisData);
  assert.equal(result.generatedListing, existing.generatedListing);
  assert.equal(result.readinessData?.analysisPending, true);
});

test('a failed reanalysis snapshot cannot erase the last successful analysis or listing', () => {
  const existing = savedProduct();
  const failedSnapshot: ProjectSaveSnapshot = { ...existing, analysisData: null, generatedListing: null, seoData: null, readinessData: null };
  const result = preserveProductWork(existing, failedSnapshot);
  assert.equal(result.analysisData, existing.analysisData);
  assert.equal(result.generatedListing, existing.generatedListing);
  assert.equal(result.seoData, existing.seoData);
  assert.equal(result.readinessData?.analysisStarted, true);
});

test('ordinary saves and page reload cannot clear pending evidence markers', () => {
  const original = savedProduct();
  const pending = preserveProductWork(original, { ...original, sourceUrl: 'https://manufacturer.example/changed' });
  const reloaded: ProjectSaveSnapshot = JSON.parse(JSON.stringify(pending));
  const attempted = { ...reloaded, readinessData: { ...original.readinessData!, shopifyReady: true, analysisPending: false, listingEvidenceStale: false } };
  const result = preserveProductWork(reloaded, attempted);
  assert.equal(result.readinessData?.analysisPending, true);
  assert.equal(result.readinessData?.shopifyReady, false);
});

test('ordinary review saves cannot make a draft with old evidence publishable', () => {
  const original = savedProduct();
  const stale = { ...original, readinessData: { ...original.readinessData!, listingEvidenceStale: true } };
  const result = preserveProductWork(stale, { ...original, readinessData: { ...original.readinessData!, listingEvidenceStale: false, shopifyReady: true } });
  assert.equal(result.readinessData?.listingEvidenceStale, true);
  assert.equal(result.readinessData?.shopifyReady, false);
});

test('only a fresh internal generation can clear the old draft evidence marker', () => {
  const original = savedProduct();
  const stale = { ...original, readinessData: { ...original.readinessData!, listingEvidenceStale: true } };
  const result = preserveProductWork(stale, { ...original, generatedListing: { ...original.generatedListing!, title: 'New validated listing' } }, { refreshListingEvidence: true });
  assert.equal(result.readinessData?.listingEvidenceStale, false);
  assert.equal(result.generatedListing?.title, 'New validated listing');
});

test('internal generation cannot clear stale draft evidence while replacement analysis is pending', () => {
  const original = savedProduct();
  const pending = { ...original, readinessData: { ...original.readinessData!, analysisPending: true, listingEvidenceStale: true } };
  const result = preserveProductWork(pending, original, { refreshListingEvidence: true });
  assert.equal(result.readinessData?.analysisPending, true);
  assert.equal(result.readinessData?.listingEvidenceStale, true);
  assert.equal(result.readinessData?.shopifyReady, false);
});

test('Product A source recovery cannot read or modify Product B analysis or listing', () => {
  const productA = savedProduct('A100');
  const productB = savedProduct('B200');
  const beforeA = JSON.stringify(productA);
  const beforeB = JSON.stringify(productB);
  const recoveredA = preserveProductWork(productA, { ...productA, sourceType: 'RAW_SPECIFICATIONS', sourceUrl: null, rawInput: 'A replacement' });
  const unchangedB = preserveProductWork(productB, productB);
  assert.equal(recoveredA.analysisData?.activeProduct.model, 'A100');
  assert.equal(unchangedB.analysisData?.activeProduct.model, 'B200');
  assert.equal(unchangedB.generatedListing?.title, 'Synthetic B200');
  assert.equal(JSON.stringify(productA), beforeA);
  assert.equal(JSON.stringify(productB), beforeB);
});

test('unchanged source does not invalidate the existing analysis', () => {
  const existing = savedProduct();
  const result = preserveProductWork(existing, { ...existing });
  assert.equal(sourceHasChanged(existing, result), false);
  assert.notEqual(result.readinessData?.analysisPending, true);
  assert.equal(result.readinessData?.shopifyReady, true);
});

test('a retained legacy draft is blocked on source changes even if its old analysis is absent', () => {
  const existing = { ...savedProduct(), analysisData: null };
  const next = { ...existing, sourceUrl: 'https://manufacturer.example/replacement' };
  const result = preserveProductWork(existing, next);
  assert.equal(result.generatedListing, existing.generatedListing);
  assert.equal(result.readinessData?.analysisPending, true);
  assert.equal(result.readinessData?.shopifyReady, false);
});
