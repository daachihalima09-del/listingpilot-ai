import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { SavedProjectWorkspace } from '@/modules/projects/client/use-project-autosave';
import {
  hasMeaningfulProductContext,
  shouldShowProjectEntry,
} from './project-entry-state.ts';

function project(
  overrides: Partial<SavedProjectWorkspace> = {},
): SavedProjectWorkspace {
  return {
    id: 'project-1',
    organizationId: 'organization-1',
    workspaceId: 'workspace-1',
    name: 'New Product',
    status: 'DRAFT',
    version: 1,
    updatedAt: '2026-08-09T00:00:00.000Z',
    sourceType: null,
    sourceUrl: null,
    rawInput: null,
    analysisData: null,
    generatedListing: null,
    seoData: null,
    readinessData: null,
    ...overrides,
  };
}

test('new empty and source-only projects open the entry experience', () => {
  assert.equal(shouldShowProjectEntry(project(), false), true);
  assert.equal(shouldShowProjectEntry(project({
    sourceType: 'PRODUCT_URL',
    sourceUrl: 'https://example.com/product',
  }), false), true);
});

test('analyzed, authoritative-draft, and Shopify-imported projects open the workspace', () => {
  assert.equal(shouldShowProjectEntry(project(), true), false);
  // Legacy listing-looking fields are not an authoritative draft.
  assert.equal(hasMeaningfulProductContext(project({
    generatedListing: {
      title: 'Saved title',
      description: 'Saved description',
      keyFeatures: 'Saved features',
    },
  })), false);
  assert.equal(shouldShowProjectEntry(project({
    generatedListing: {
      title: 'Saved title',
      description: 'Saved description',
      keyFeatures: 'Saved features',
    },
  }), false), true);
  assert.equal(shouldShowProjectEntry(project({ sourceType: 'SHOPIFY_IMPORT' }), false), false);
});

test('empty saved projects use neutral state and never initialize Samsung demo data', async () => {
  const source = await readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /initialProject \? emptyProduct : demoProduct/);
  assert.match(source, /const emptyListingContent/);
  assert.doesNotMatch(source, /restoredAnalysis\?\.activeProduct \?\? demoProduct/);
  assert.match(source, /readAuthoritativeListingDraft\(initialProject\?\.generatedListing\)/);
  assert.match(source, /generatedListing: persistedDraftFields\?\.generatedListing \?\? null/);
  assert.match(source, /seoData: persistedDraftFields\?\.seoData \?\? null/);
});

test('demo analysis activates only through the explicit demo action', async () => {
  const source = await readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /const handleLoadDemoProduct/);
  assert.match(source, /setUseDemoFallback\(true\)/);
  assert.equal(source.match(/setUseDemoFallback\(true\)/g)?.length, 1);
  assert.match(source, /onLoadDemoProduct=\{handleLoadDemoProduct\}/);
});

test('entry supports Product URL and Analyze Product then reveals the workspace', async () => {
  const [workspace, input] = await Promise.all([
    readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./ProductInput.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(input, /Product URL/);
  assert.match(input, /type="url"/);
  assert.match(input, /Analyze Product/);
  assert.match(workspace, /startPipeline[\s\S]*setAnalysisStarted\(true\)/);
  assert.match(workspace, /showProjectEntry \? \(/);
  assert.match(workspace, /role="tablist"/);
});

test('entry is responsive and source controls remain keyboard accessible', async () => {
  const input = await readFile(new URL('./ProductInput.tsx', import.meta.url), 'utf8');
  assert.match(input, /max-w-full overflow-hidden/);
  assert.match(input, /sm:p-8/);
  assert.match(input, /aria-pressed=\{inputMode === mode\.key\}/);
  assert.match(input, /aria-labelledby=\{entryMode/);
  assert.match(input, /type="button"/);
  assert.doesNotMatch(input, /min-w-\[[4-9][0-9]{2}px\]/);
});

test('entry state is derived only from server project state and current analysis', async () => {
  const source = await readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /shouldShowProjectEntry\(initialProject, analysisStarted\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|zustand/i);
});

test('authenticated analysis surfaces contain no product-specific demo timeline or conflict fallback', async () => {
  const [timeline, detective, recent] = await Promise.all([
    readFile(new URL('./ActivityTimeline.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./AIDetective.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./RecentAnalyses.tsx', import.meta.url), 'utf8'),
  ]);
  const authenticatedSurface = `${timeline}\n${detective}\n${recent}`;
  assert.doesNotMatch(authenticatedSurface, /['"`]Samsung|['"`]Q80D|['"`]Amazon|['"`]Refresh Rate|144\s*Hz|120\s*Hz/i);
  assert.match(timeline, /Reading Product Input/);
  assert.match(timeline, /Building Product Truth/);
  assert.match(detective, /product\.conflict\.official/);
  assert.match(recent, /product\.analyses\.map/);
});

test('normal project analysis cannot enter demo state or synthesize PDF results', async () => {
  const [workspace, input] = await Promise.all([
    readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('./ProductInput.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(workspace, /buildUploadedPdfDemoProduct/);
  assert.match(workspace, /analysisInput\.kind === 'uploaded-pdf'[\s\S]*PDF analysis is not available yet/);
  assert.match(workspace, /useLiveAnalysis = analysisInput\.kind !== 'raw-specifications' \|\| !useDemoFallback/);
  assert.doesNotMatch(input, /Stored locally for this demo|Demo Mode/);
});

test('health, draft provenance, exports, and saved snapshots use current project state', async () => {
  const [workspace, csv] = await Promise.all([
    readFile(new URL('./ListingWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../lib/shopify-csv.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /scoredRows\.reduce/);
  assert.match(workspace, /activeProduct: currentProduct/);
  assert.match(workspace, /Using your saved Listing Style at generation time/);
  assert.match(workspace, /Variants not assessed/);
  assert.match(workspace, /shopifyReady: exportReady/);
  assert.doesNotMatch(workspace, /catalogHealth\.score \+ 2|status === 'warning' && conflictResolved/);
  assert.doesNotMatch(csv, /1299\.00|'Electronics'|'TV'|'TRUE'/);
});

test('project route remounts workspace state for each selected project', async () => {
  const page = await readFile(new URL('../../app/workspace/[projectId]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /<ListingWorkspace\s+key=\{project\.id\}/);
});
