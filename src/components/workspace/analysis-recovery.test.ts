import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { ProductAnalysis } from '../../lib/analysis-schema.ts';
import type { ProjectSaveSnapshot, SavedProjectWorkspace } from '../../modules/projects/client/use-project-autosave.ts';
import { buildProductAnalysisData, preserveProductWork, sourceHasChanged } from '../../modules/products/analysis/analysis-state.ts';
import { canonicalGenerationEligibility, createProjectListingGenerationPlan } from '../../modules/listing-generation/index.ts';
import { generationInput } from '../../modules/listing-generation/tests/fixtures.ts';
import { eligibilityBlockers } from '../../modules/shopify/safe-publishing/publishing-plan.ts';
import { ListingDraftEngine } from '../../modules/listing-draft/builder/draft-engine.ts';
import type { ListingDraft } from '../../modules/listing-draft/domain/contracts.ts';
import { listingDraftProjectFields, readAuthoritativeListingDraft } from '../../modules/listing-draft/persistence/authoritative-draft-state.ts';
import { listingDraftSchema } from '../../modules/listing-draft/validation/draft-schema.ts';
import { draftInstructions, validProviderOutput } from '../../modules/listing-draft/tests/fixtures.ts';

function analysisFor(model: string): ProductAnalysis {
  return {
    product: { brand: 'Synthetic', model, panel: '', hdr: '', refreshRate: '', resolution: '', smartPlatform: '', warranty: '' },
    truthRows: [{ field: 'Model', value: model, source: 'Merchant information', sourcesCount: 1, confidence: 95, status: 'Verified', reasoning: 'Supplied product information.' }],
    listing: { title: 'Unused preliminary copy', description: 'Unused preliminary description', keyFeatures: 'Unused preliminary features', seoTitle: '', seoDescription: '', tags: '' },
    missingFields: [], overallConfidence: 95, conflict: null,
  };
}

async function savedProduct(): Promise<SavedProjectWorkspace> {
  const instructions = draftInstructions();
  const draft = await new ListingDraftEngine({ provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: null }) } }).generate(instructions);
  const source = { sourceType: 'PRODUCT_URL' as const, sourceUrl: 'https://manufacturer.example/old-product', rawInput: null };
  return {
    ...source, ...listingDraftProjectFields(listingDraftSchema.parse(draft)),
    id: '33333333-3333-4333-8333-333333333333', containerProjectId: '22222222-2222-4222-8222-222222222222',
    organizationId: '11111111-1111-4111-8111-111111111111', workspaceId: '44444444-4444-4444-8444-444444444444',
    name: 'Synthetic Product', status: 'DRAFT', version: 7, updatedAt: '2026-01-01T00:00:00.000Z',
    analysisData: buildProductAnalysisData(analysisFor('ORIGINAL'), source),
    readinessData: { analysisStarted: true, activeStage: 'review', completedStages: ['input', 'extract', 'verify', 'generate'], shopifyReady: false },
  };
}

interface ElementRecord { type: string; props: Record<string, unknown> }
interface InputActions {
  inputMode: string;
  analysisStarted: boolean;
  isRunning: boolean;
  inputError: string | null;
  onModeChange(mode: 'product' | 'specs'): void;
  onUrlChange(mode: 'product', url: string): void;
  onSpecTextChange(text: string): void;
  onAnalyze(): Promise<void>;
  onPasteProductInformation?: () => void;
}

interface DetectiveActions {
  hasConflict: boolean;
  conflictResolved: boolean;
  readOnly: boolean;
  showRecommendation: boolean;
  recommendationConfidence: number;
  onResolve(): void;
}

const preferences = generationInput().merchantPreferences;
function savedEligibility(project: SavedProjectWorkspace, snapshot: ProjectSaveSnapshot, version: number) {
  // Match the independent JSON objects returned by Product persistence.
  const persisted = JSON.parse(JSON.stringify(snapshot)) as ProjectSaveSnapshot;
  return canonicalGenerationEligibility(createProjectListingGenerationPlan({
    project: {
      ...project, ...persisted, version, archivedAt: null, readiness: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date(project.updatedAt),
    },
    effectivePreferences: { ...preferences, workspaceId: project.workspaceId },
    businessProfile: { sectionVersions: {} } as Parameters<typeof createProjectListingGenerationPlan>[0]['businessProfile'],
  }));
}

function conflictingAnalysis(confidence = 73): ProductAnalysis {
  const result = analysisFor('REPLACEMENT');
  result.truthRows = [
    { field: 'Brand', value: 'Synthetic', source: 'Official manufacturer information', sourcesCount: 1, confidence: 95, status: 'Verified', reasoning: 'Directly supplied synthetic brand.' },
    { field: 'Model', value: 'REPLACEMENT / OTHER', source: 'Official manufacturer information', sourcesCount: 1, confidence, status: 'Conflict', reasoning: 'Two supplied synthetic models conflict.' },
    { field: 'Product Type', value: 'Television', source: 'Official manufacturer information', sourcesCount: 1, confidence: 95, status: 'Verified', reasoning: 'Directly supplied synthetic product type.' },
    { field: 'Screen Size', value: '55 inch', source: 'Official manufacturer information', sourcesCount: 1, confidence: 95, status: 'Verified', reasoning: 'Directly supplied synthetic screen size.' },
  ];
  result.conflict = { field: 'Model', values: ['REPLACEMENT', 'OTHER'], recommendedValue: 'REPLACEMENT', confidence, explanation: 'Synthetic supplied model conflict.' };
  return result;
}

async function savedConflictProduct() {
  const initial = { ...await savedProduct(), sourceUrl: 'https://official.manufacturer.example/replacement' };
  return {
    ...initial, version: 8, analysisData: buildProductAnalysisData(conflictingAnalysis(), initial),
    readinessData: { ...initial.readinessData!, analysisPending: false, listingEvidenceStale: true, shopifyReady: false },
  };
}

function createWorkspace(initialProject: SavedProjectWorkspace, options: { canManage?: boolean; autosaveStatus?: 'saved' | 'conflict' } = {}) {
  const slots: Array<{ value?: unknown; dependencies?: readonly unknown[]; cleanup?: () => void }> = [];
  const effects: Array<() => void> = [];
  const events: string[] = [];
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  const generationRequests: string[] = [];
  let cursor = 0;
  let dirty = false;
  let elements: ElementRecord[] = [];
  let snapshot: ProjectSaveSnapshot;
  let adopted: { version: number; snapshot: ProjectSaveSnapshot } | null = null;
  let version = initialProject.version;
  let persistedSnapshot: ProjectSaveSnapshot = {
    sourceType: initialProject.sourceType, sourceUrl: initialProject.sourceUrl, rawInput: initialProject.rawInput,
    analysisData: initialProject.analysisData, generatedListing: initialProject.generatedListing,
    seoData: initialProject.seoData, readinessData: initialProject.readinessData,
  };
  const initialEligibility = savedEligibility(initialProject, persistedSnapshot, version);
  let respond: ((result: { ok: boolean; json(): Promise<unknown> }) => void) | null = null;
  const react = {
    useRef<T>(value: T) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: value } };
      return slots[index].value as { current: T };
    },
    useState<T>(value: T) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value };
      return [slots[index].value as T, (next: T | ((current: T) => T)) => {
        const previous = slots[index].value as T;
        const updated = typeof next === 'function' ? (next as (current: T) => T)(previous) : next;
        if (!Object.is(previous, updated)) { slots[index].value = updated; dirty = true; }
      }];
    },
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useEffect(effect: () => (() => void) | void, dependencies: readonly unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (previous?.dependencies?.length === dependencies.length && dependencies.every((value, position) => Object.is(value, previous.dependencies?.[position]))) return;
      effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: effect() || undefined }; });
    },
  };
  const autosave = {
    status: options.autosaveStatus ?? 'saved', message: 'Saved', get currentVersion() { return version; },
    async saveNow() { events.push('saveNow'); return version; },
    async pauseAndDrain() { events.push('pauseAndDrain'); return version; },
    resume() { events.push('resume'); },
    adoptExternalSave(nextVersion: number, nextSnapshot: ProjectSaveSnapshot) {
      events.push('adoptExternalSave'); version = nextVersion; adopted = { version, snapshot: nextSnapshot };
      persistedSnapshot = nextSnapshot;
    },
  };
  function jsx(type: unknown, props: Record<string, unknown>) {
    const element = { type: typeof type === 'function' ? type.name : String(type), props };
    elements.push(element);
    return element;
  }
  const exports: Record<string, unknown> = {};
  const source = readFileSync('src/components/workspace/ListingWorkspace.tsx', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, {
    exports, URL, URLSearchParams, AbortController, Error,
    crypto: { randomUUID: () => '55555555-5555-4555-8555-555555555555' },
    window: { setTimeout: () => 1, clearTimeout: () => undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) },
    fetch(path: string, options: { body: string }) {
      requests.push({ path, body: JSON.parse(options.body) }); events.push('fetch');
      return new Promise((resolve) => { respond = resolve; });
    },
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {}, push() {} }) };
      if (name.endsWith('/category-readiness')) return { applicableReadinessRows: (rows: unknown) => rows };
      if (name.endsWith('/project-entry-state')) return { shouldShowProjectEntry: () => false };
      if (name.endsWith('/analysis-state')) return { sourceHasChanged };
      if (name.endsWith('/authoritative-draft-state')) return { listingDraftProjectFields, readAuthoritativeListingDraft };
      if (name.endsWith('/use-project-autosave')) return { useProjectAutosave: (options: { snapshot: ProjectSaveSnapshot }) => { snapshot = options.snapshot; return autosave; } };
      if (name.endsWith('/project-api')) return {
        projectApiRequest: async (path: string, request: { method: string }) => {
          generationRequests.push(request.method);
          assert.equal(request.method, 'GET', `Unexpected generation request: ${path}`);
          return { eligibility: savedEligibility(initialProject, persistedSnapshot, version), projectVersion: version };
        }, ProjectApiError: Error,
      };
      if (name.endsWith('/shopify-description')) return { assembleShopifyListing: () => ({}) };
      if (name.endsWith('/demo-analysis-adapter')) return {
        isPdfFileName: (filename: string) => filename.endsWith('.pdf'),
        isValidHttpUrl: (url: string) => /^https?:\/\//u.test(url), normalizePastedHttpUrl: (url: string) => url.trim(),
      };
      if (name === 'next/link') return { __esModule: true, default: 'Link' };
      return new Proxy({}, { get(_target, key) {
        if (key === '__esModule') return true;
        return Object.defineProperty(() => null, 'name', { value: String(key) });
      } });
    },
  });
  const component = exports.ListingWorkspace as (props: { initialProject: SavedProjectWorkspace; canManage: boolean; generationEligibility: unknown; generationEligibilityVersion: number }) => unknown;
  function render() {
    let turns = 0;
    do {
      dirty = false; cursor = 0; elements = [];
      component({ initialProject, canManage: options.canManage ?? true, generationEligibility: initialEligibility, generationEligibilityVersion: initialProject.version });
      for (const effect of effects.splice(0)) effect();
      if (++turns > 10) throw new Error('Unexpected workspace render loop.');
    } while (dirty);
  }
  function input(): InputActions {
    const found = elements.find((element) => element.type === 'ProductInput');
    assert.ok(found, 'Product information controls must be present.');
    return found.props as unknown as InputActions;
  }
  function selectTab(tab: string) {
    const selected = elements.find((element) => element.props.id === `workspace-tab-${tab}`);
    assert.ok(selected, `Workspace tab ${tab} is present.`);
    (selected.props.onClick as () => void)(); render();
  }
  render(); selectTab('advanced');
  return {
    render, input, selectTab, requests, events, generationRequests,
    detective() {
      const found = elements.find((element) => element.type === 'AIDetective');
      assert.ok(found); return found.props as unknown as DetectiveActions;
    },
    generationButton() {
      const found = elements.find((element) => element.type === 'button' && Array.isArray(element.props.children) && element.props.children.includes('Generate Listing'));
      assert.ok(found); return found.props as { disabled: boolean; onClick(): Promise<void> };
    },
    flushAutosave() {
      persistedSnapshot = preserveProductWork(persistedSnapshot, snapshot);
      version += 1;
      return { ...initialProject, ...persistedSnapshot, version };
    },
    get snapshot() { return snapshot; },
    readAdopted() { return adopted; },
    get elements() { return elements; },
    async tick() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); },
    respond(payload: unknown, ok = true) {
      assert.ok(respond, 'The analysis request was made.');
      respond({ ok, json: async () => payload });
    },
  };
}

test('real workspace handlers retain saved analysis and draft through source edits and input-mode changes', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  const priorDraftId = initial.generatedListing?.listingDraft?.draftId;
  workspace.input().onUrlChange('product', 'https://manufacturer.example/replacement');
  workspace.render();
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  assert.equal(workspace.snapshot.generatedListing?.listingDraft?.draftId, priorDraftId);
  assert.equal(workspace.snapshot.readinessData?.analysisPending, true);
  assert.equal(workspace.snapshot.readinessData?.shopifyReady, false);
  workspace.input().onModeChange('specs'); workspace.render();
  workspace.input().onSpecTextChange('Replacement merchant information'); workspace.render();
  assert.equal(workspace.snapshot.rawInput, 'Replacement merchant information');
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  assert.equal(workspace.snapshot.generatedListing?.listingDraft?.draftId, priorDraftId);
  const review = workspace.elements.find((element) => element.type === 'ListingDraftReview');
  assert.equal(review?.props.readOnly, true);
});

test('HTTP 403 recovery uses pasted information on the same Product and preserves existing work', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  const pending = workspace.input().onAnalyze();
  await workspace.tick(); workspace.render();
  assert.equal(workspace.input().isRunning, true);
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  workspace.respond({ error: 'This website blocks automated reading. Paste the Product information to continue.', code: 'SOURCE_ACCESS_DENIED', recoveryAction: 'PASTE_PRODUCT_INFORMATION' }, false);
  await pending; workspace.render();
  assert.equal(workspace.input().isRunning, false);
  assert.match(workspace.input().inputError ?? '', /blocks automated reading/u);
  assert.equal(typeof workspace.input().onPasteProductInformation, 'function');
  workspace.input().onPasteProductInformation?.(); workspace.render();
  assert.equal(workspace.input().inputMode, 'specs');
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  assert.equal(workspace.snapshot.generatedListing?.listingDraft?.draftId, initial.generatedListing?.listingDraft?.draftId);
  const identity = workspace.requests[0].body.productIdentity as Record<string, unknown>;
  assert.equal(identity.productId, initial.id);
  assert.equal(identity.projectId, initial.containerProjectId);
  assert.equal(identity.workspaceId, initial.workspaceId);
  assert.equal(workspace.readAdopted(), null);
});

test('analysis completes only after adopting the authoritative saved Product response and retained draft', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  const pending = workspace.input().onAnalyze();
  await workspace.tick(); workspace.render();
  assert.equal(workspace.readAdopted(), null);
  assert.equal(workspace.input().isRunning, true);
  const saved = { ...initial, version: 8, analysisData: buildProductAnalysisData(analysisFor('REANALYZED'), initial), readinessData: { ...initial.readinessData!, analysisPending: false, listingEvidenceStale: true } };
  workspace.respond({ savedProduct: saved });
  await pending; workspace.render();
  assert.equal(workspace.readAdopted()?.version, 8);
  assert.equal(workspace.readAdopted()?.snapshot.analysisData?.activeProduct.model, 'REANALYZED');
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'REANALYZED');
  assert.equal(workspace.snapshot.generatedListing?.listingDraft?.draftId, initial.generatedListing?.listingDraft?.draftId);
  assert.equal(workspace.snapshot.readinessData?.listingEvidenceStale, true);
  assert.equal(workspace.snapshot.readinessData?.shopifyReady, false);
  assert.equal(workspace.input().isRunning, false);
  assert.ok(workspace.events.indexOf('adoptExternalSave') < workspace.events.lastIndexOf('resume'));
  const refreshed = createWorkspace(JSON.parse(JSON.stringify(saved)) as SavedProjectWorkspace);
  assert.equal(refreshed.snapshot.analysisData?.activeProduct.model, 'REANALYZED');
  assert.equal(refreshed.snapshot.generatedListing?.listingDraft?.draftId, initial.generatedListing?.listingDraft?.draftId);
  assert.equal(refreshed.snapshot.readinessData?.listingEvidenceStale, true);
  assert.equal(refreshed.snapshot.readinessData?.shopifyReady, false);
});

test('refresh restores pending source edits while retaining the last successful Product Truth and listing', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  workspace.input().onUrlChange('product', 'https://manufacturer.example/pending-replacement');
  workspace.render();
  const refreshed = createWorkspace(JSON.parse(JSON.stringify({ ...initial, ...workspace.snapshot, version: 8 })) as SavedProjectWorkspace);
  assert.equal(refreshed.snapshot.sourceUrl, 'https://manufacturer.example/pending-replacement');
  assert.equal(refreshed.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  assert.equal(refreshed.snapshot.generatedListing?.listingDraft?.draftId, initial.generatedListing?.listingDraft?.draftId);
  assert.equal(refreshed.snapshot.readinessData?.analysisPending, true);
  assert.equal(refreshed.snapshot.readinessData?.shopifyReady, false);
});

test('an unconfirmed analysis response cannot report completion or replace prior Product Truth', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  const pending = workspace.input().onAnalyze();
  await workspace.tick();
  workspace.respond({ analysis: analysisFor('UNSAVED') });
  await pending; workspace.render();
  assert.match(workspace.input().inputError ?? '', /saved analysis could not be confirmed/u);
  assert.equal(workspace.snapshot.analysisData?.activeProduct.model, 'ORIGINAL');
  assert.equal(workspace.readAdopted(), null);
  assert.equal(workspace.input().isRunning, false);
});

test('current saved model conflict can be resolved while its retained draft remains locked and unpublishable', async () => {
  const initial = await savedConflictProduct();
  const workspace = createWorkspace(initial);
  assert.equal(workspace.detective().readOnly, false);
  assert.equal(workspace.detective().showRecommendation, true);
  assert.equal(workspace.detective().recommendationConfidence, 73);
  assert.ok(savedEligibility(initial, initial, initial.version).blockingFindings.some(({ code, fieldIds }) => code === 'CRITICAL_TRUTH_CONFLICT' && fieldIds.includes('model')));
  assert.equal(workspace.generationButton().disabled, true);
  await workspace.generationButton().onClick();
  assert.equal(workspace.generationRequests.includes('POST'), false);
  workspace.selectTab('advanced');
  workspace.detective().onResolve(); workspace.render();
  assert.equal(workspace.snapshot.analysisData?.truthRows.find(({ field }) => field === 'Model')?.status, 'Verified');
  assert.equal(workspace.snapshot.analysisData?.truthRows.find(({ field }) => field === 'Model')?.value, 'REPLACEMENT');
  assert.equal(workspace.detective().conflictResolved, true);
  assert.equal(workspace.generationButton().disabled, true, 'Resolution must be saved before eligibility refresh.');
  const saved = workspace.flushAutosave(); workspace.render(); await workspace.tick(); workspace.render();
  const eligibility = savedEligibility(saved, saved, saved.version);
  assert.equal(eligibility.canGenerate, true, JSON.stringify(eligibility.blockingFindings));
  assert.equal(workspace.generationButton().disabled, false, 'Fresh canonical eligibility permits generation after resolution is saved.');
  assert.equal(workspace.snapshot.readinessData?.listingEvidenceStale, true);
  assert.equal(workspace.snapshot.readinessData?.shopifyReady, false);
  assert.equal(workspace.snapshot.generatedListing?.listingDraft?.draftId, initial.generatedListing?.listingDraft?.draftId);
  const review = workspace.elements.find(({ type }) => type === 'ListingDraftReview');
  assert.equal(review?.props.readOnly, true);
  assert.ok(eligibilityBlockers({
    role: 'OWNER', draft: readAuthoritativeListingDraft(workspace.snapshot.generatedListing) as unknown as ListingDraft, projectVersion: saved.version,
    connected: true, preferences, readinessData: workspace.snapshot.readinessData,
  }).some((message) => /Analyze the current product information and generate a new listing/u.test(message)));
  const refreshed = createWorkspace(saved);
  assert.equal(refreshed.detective().conflictResolved, true);
  assert.equal(refreshed.detective().recommendationConfidence, workspace.detective().recommendationConfidence);
  assert.equal(refreshed.generationButton().disabled, false);
  assert.equal(refreshed.snapshot.readinessData?.listingEvidenceStale, true);
  assert.equal(refreshed.snapshot.readinessData?.shopifyReady, false);
});

test('pending source edits and known version conflicts reject conflict callbacks as well as disabling the control', async () => {
  const initial = await savedConflictProduct();
  for (const workspace of [
    createWorkspace({ ...initial, readinessData: { ...initial.readinessData, analysisPending: true } }),
    createWorkspace(initial, { canManage: false }),
    createWorkspace(initial, { autosaveStatus: 'conflict' }),
  ]) {
    assert.equal(workspace.detective().readOnly, true);
    const before = JSON.stringify(workspace.snapshot.analysisData);
    workspace.detective().onResolve(); workspace.render();
    assert.equal(JSON.stringify(workspace.snapshot.analysisData), before);
  }
  const workspace = createWorkspace(initial);
  workspace.input().onUrlChange('product', 'https://manufacturer.example/pending'); workspace.render();
  assert.equal(workspace.detective().readOnly, true);
  workspace.detective().onResolve(); workspace.render();
  assert.equal(workspace.snapshot.analysisData?.conflictResolved, false);
  assert.equal(workspace.snapshot.analysisData?.truthRows.find(({ field }) => field === 'Model')?.status, 'Conflict');
});

test('analysis in flight or an unconfirmed replacement cannot resolve the old analysis even through a retained callback', async () => {
  const initial = await savedConflictProduct();
  const workspace = createWorkspace(initial);
  const previousResolve = workspace.detective().onResolve;
  workspace.input().onUrlChange('product', 'https://official.manufacturer.example/pending'); workspace.render();
  const pending = workspace.input().onAnalyze();
  previousResolve();
  await workspace.tick(); workspace.render();
  assert.equal(workspace.detective().readOnly, true);
  workspace.detective().onResolve(); workspace.render();
  assert.equal(workspace.snapshot.analysisData?.conflictResolved, false);
  workspace.respond({ analysis: conflictingAnalysis(41) });
  await pending; workspace.render();
  assert.equal(workspace.detective().readOnly, true);
  workspace.detective().onResolve(); workspace.render();
  assert.equal(workspace.snapshot.analysisData?.conflictResolved, false);
  assert.equal(workspace.snapshot.analysisData?.truthRows.find(({ field }) => field === 'Model')?.confidence, 73);
});

test('every saved analysis immediately refreshes recommendation visibility and confidence without reloading', async () => {
  const initial = await savedProduct();
  const workspace = createWorkspace(initial);
  assert.equal(workspace.detective().showRecommendation, false);
  for (const [index, analysis] of [conflictingAnalysis(61), conflictingAnalysis(44), analysisFor('NO-CONFLICT')].entries()) {
    const pending = workspace.input().onAnalyze(); await workspace.tick(); workspace.render();
    const saved = {
      ...initial, version: 8 + index, analysisData: buildProductAnalysisData(analysis, initial),
      readinessData: { ...initial.readinessData!, analysisPending: false, listingEvidenceStale: true },
    };
    workspace.respond({ savedProduct: saved }); await pending; workspace.render();
    assert.equal(workspace.detective().showRecommendation, Boolean(analysis.conflict));
    assert.equal(workspace.detective().recommendationConfidence, analysis.conflict ? analysis.truthRows[1].confidence : analysis.overallConfidence);
    assert.equal(workspace.detective().readOnly, false);
    assert.equal(workspace.snapshot.readinessData?.listingEvidenceStale, true);
    const refreshed = createWorkspace(saved);
    assert.equal(refreshed.detective().showRecommendation, workspace.detective().showRecommendation);
    assert.equal(refreshed.detective().recommendationConfidence, workspace.detective().recommendationConfidence);
    assert.equal(refreshed.detective().readOnly, false);
  }
});
