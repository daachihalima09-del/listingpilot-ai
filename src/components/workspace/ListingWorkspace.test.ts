import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8');
const draftRouteErrors = await readFile(new URL('../../modules/listing-draft/persistence/route-helpers.server.ts', import.meta.url), 'utf8');

test('Overview is the default and the six employee workflow tabs are accessible', () => {
  assert.match(source, /useState<WorkspaceTab>\('OVERVIEW'\)/);
  for (const tab of ['OVERVIEW', 'LISTING', 'IMAGES', 'METAFIELDS', 'SHOPIFY', 'ADVANCED']) assert.match(source, new RegExp(`id: '${tab}'`));
  assert.doesNotMatch(source, /id: 'REVIEW'/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /ArrowLeft/);
});

test('merchant work is progressively disclosed into the correct primary areas', () => {
  assert.match(source, /workspaceTab === 'LISTING'/);
  assert.match(source, /<ListingDraftReview/);
  assert.match(source, /<ProductTruthTable/);
  assert.match(source, /<AIDetective/);
  assert.match(source, /workspaceTab === 'SHOPIFY'/);
  assert.match(source, /Ready for Shopify/);
  assert.match(source, /<ShopifyListingPreview/);
  assert.match(source, /workspaceTab === 'ADVANCED'/);
  assert.match(source, /<details/);
});

test('top-level tabs own listing, evidence, Shopify preview and advanced controls without nested review navigation', async () => {
  const review = await readFile(new URL('../../modules/listing-draft/review/ListingDraftReview.tsx', import.meta.url), 'utf8');
  assert.match(source, /view="LISTING"/u);
  assert.match(source, /view="ADVANCED"/u);
  assert.doesNotMatch(source, /view="REVIEW"/u);
  assert.doesNotMatch(review, /Draft review sections|listingpilot:draft-review-tab|role="tablist"/u);
  assert.match(review, /view === 'ADVANCED'/u);
  assert.match(review, /Product Intelligence &amp; Diagnostics/u);
});

test('one primary CTA is derived from workflow state and legacy tools stay collapsed', () => {
  for (const label of ['Analyze Product', 'Generate Listing', 'Review Listing', 'Prepare for Shopify']) assert.match(source, new RegExp(label));
  assert.match(source, /Open technical and legacy tools/);
  assert.doesNotMatch(source, /<details[^>]+open/);
  assert.match(source, /publishingReviewComplete/);
  assert.match(source, /onOpenListing=\{\(\) => selectWorkspaceTab\('LISTING'\)\}/);
  assert.match(source, /onContinue=\{\(\) => selectWorkspaceTab\('IMAGES'\)\}/);
});

test('mobile navigation contains overflow protection and cards stack before wide breakpoints', () => {
  assert.match(source, /max-w-full gap-1 overflow-x-auto/);
  assert.match(source, /xl:grid-cols/);
  assert.match(source, /break-words/);
});

test('safe publishing route and calibration remain reachable', () => {
  assert.match(source, /\/shopify-publish/);
  assert.match(source, /handleAddToGoldLibrary/);
  assert.match(source, /listing\/calibration/);
});

test('generation readiness is compact, canonical, and collapsed by default', () => {
  assert.match(source, /Ready to generate/);
  assert.match(source, /eligibility\.warnings\.length/);
  assert.match(source, /View details/);
  assert.match(source, /<details className="mt-3">/);
  assert.doesNotMatch(source, /<details className="mt-3" open/);
  assert.match(source, /Listing needs attention/);
  assert.match(source, /Review issues/);
  assert.match(source, /!canGenerateListing/);
});

test('generation shows one real in-flight state and never exposes provisional content', () => {
  assert.match(source, /generationRequestRef\.current/);
  assert.match(source, /setWorkspaceTab\('LISTING'\)/);
  assert.match(source, /Generating content/);
  assert.match(source, /Fact checks, quality checks, and saving will follow/);
  assert.match(source, /Listing generated and quality checked/);
  assert.match(source, /No listing generated yet/);
  assert.doesNotMatch(source, /!listingDraft \? <GeneratedListing/);
});

test('eligibility refresh has bounded loading, error, retry, and request deduplication', () => {
  assert.match(source, /type EligibilityRefreshStatus = 'idle' \| 'loading' \| 'success' \| 'error'/);
  assert.match(source, /ELIGIBILITY_TIMEOUT_MS = 8_000/);
  assert.match(source, /Could not refresh listing readiness\./);
  assert.match(source, /Try again/);
  assert.match(source, /eligibilityRequestRef\.current\?\.key === requestKey/);
  assert.match(source, /\.finally\(\(\) =>/);
  assert.doesNotMatch(source, /projectSave\.status !== 'saved'[\s\S]{0,200}generationEligibilityVersion/);
});

test('generation is bounded, deduplicated, and saves exactly once before using an authoritative version', () => {
  assert.match(source, /GENERATION_TIMEOUT_MS = 90_000/);
  assert.match(source, /generationRequestRef\.current/);
  assert.match(source, /await projectSave\.saveNow\(\)/);
  assert.match(source, /version: authoritativeVersion/);
  assert.match(source, /We couldn't generate this listing in time/);
  assert.match(source, /finally[\s\S]{0,180}setIsGeneratingDraft\(false\)/);
});

test('primary generation errors use merchant language without validator internals', () => {
  assert.match(draftRouteErrors, /Listing quality check failed/);
  assert.doesNotMatch(draftRouteErrors, /visibly match every cited selected fact/);
});
