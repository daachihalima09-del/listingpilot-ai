import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const realRequire = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const identityA = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  productId: '33333333-3333-4333-8333-333333333333', version: 3,
};
const identityB = { ...identityA, productId: '44444444-4444-4444-8444-444444444444' };
const operationRequestId = '55555555-5555-4555-8555-555555555555';
const offlineAnalysis = {
  product: { brand: 'Synthetic', model: 'Model A', panel: 'LCD', hdr: 'Missing', refreshRate: '60 Hz', resolution: '4K', smartPlatform: 'Missing', warranty: 'Missing' },
  truthRows: [{ field: 'Brand', value: 'Synthetic', source: 'Pasted specifications', sourcesCount: 1, confidence: 95, status: 'Verified', reasoning: 'Directly supplied.' }],
  listing: {
    title: 'Synthetic Model A television with directly supplied LCD display specifications for an offline Product recovery regression',
    description: 'Synthetic product information for offline route testing. '.repeat(18),
    keyFeatures: '• Synthetic supplied specification for offline testing.\n'.repeat(10),
    seoTitle: 'Synthetic Model A', seoDescription: 'Synthetic offline fixture.', tags: 'synthetic',
  },
  missingFields: ['warranty'], overallConfidence: 95, conflict: null,
};

class MockProjectError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(code: string, message: string, statusCode: number) { super(message); this.code = code; this.statusCode = statusCode; }
}
class MockExtractionError extends Error {
  readonly status = 502;
  readonly upstreamStatus: number;
  constructor(upstreamStatus = 403) { super(`The product page could not be read (HTTP ${upstreamStatus}).`); this.upstreamStatus = upstreamStatus; }
}
class MockProviderError extends Error {
  readonly requestId = null;
  readonly code = 'TIMED_OUT';
  readonly statusCode = 504;
}
class MockProtectionError extends Error { readonly code = 'OFFLINE'; readonly statusCode = 429; }

interface SavedRecord {
  workspaceId: string; projectId: string; productId: string; version: number; updatedAt: Date;
  analysisData: unknown; readinessData: unknown; generatedListing: unknown; seoData: unknown;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function routeHarness(options: {
  user?: { id: string } | null; accessError?: MockProjectError; extractionError?: MockExtractionError;
  providerError?: MockProviderError; saveError?: MockProjectError; blockSave?: boolean;
} = {}) {
  const records = new Map<string, SavedRecord>([identityA, identityB].map((identity) => [identity.productId, {
    ...identity, updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    analysisData: { marker: `saved-analysis-${identity.productId}` }, readinessData: { marker: 'previous-readiness' },
    generatedListing: { marker: `saved-draft-${identity.productId}` }, seoData: { marker: `saved-seo-${identity.productId}` },
  }]));
  const lookups: Array<Record<string, unknown>> = [];
  const saves: Array<Record<string, unknown>> = [];
  const events: string[] = [];
  const saveEntered = deferred();
  const releaseSave = deferred();
  let extractionCalls = 0;
  let providerCalls = 0;
  let reservations = 0;
  const lookup = async (_actor: string, identity: Record<string, unknown>) => {
    lookups.push(identity);
    assert.deepEqual(Object.keys(identity).sort(), ['productId', 'projectId', 'workspaceId']);
    if (options.accessError) throw options.accessError;
    const record = records.get(String(identity.productId));
    if (!record || record.workspaceId !== identity.workspaceId || record.projectId !== identity.projectId) {
      throw new MockProjectError('PRODUCT_NOT_FOUND', 'The Product is unavailable in this workspace.', 404);
    }
    return { ...record, id: record.productId };
  };
  const save = async (_actor: string, input: Record<string, unknown>) => {
    saves.push(input); events.push('save-start'); saveEntered.resolve();
    if (options.blockSave) await releaseSave.promise;
    if (options.saveError) throw options.saveError;
    const current = records.get(String(input.productId));
    if (!current || current.workspaceId !== input.workspaceId || current.projectId !== input.projectId) {
      throw new MockProjectError('PRODUCT_NOT_FOUND', 'The Product is unavailable in this workspace.', 404);
    }
    if (input.version !== current.version) throw new MockProjectError('PROJECT_STALE_WRITE', 'Product changed.', 409);
    const saved = { ...current, version: current.version + 1, updatedAt: new Date('2026-01-01T00:01:00.000Z'), analysisData: input.analysisData };
    records.set(saved.productId, saved); events.push('save-complete');
    return { ...saved, id: saved.productId };
  };
  const mocks: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    '@/modules/auth/server/context': { getCurrentUser: async () => options.user === undefined ? { id: 'offline-owner' } : options.user },
    '@/modules/products/services/product-service.server': { getUserProduct: lookup, requireUserProductAnalysisAccess: lookup, saveUserProductAnalysis: save },
    '@/modules/projects/types/errors': { ProjectError: MockProjectError },
    '@/lib/product-page-extractor': {
      ProductPageExtractionError: MockExtractionError,
      extractProductPage: async () => {
        extractionCalls += 1;
        if (options.extractionError) throw options.extractionError;
        return { pageText: 'Synthetic manufacturer product information.', finalUrl: 'https://manufacturer.example/product', sourceImages: [] };
      },
    },
    '@/modules/openai/responses-client-core': { OpenAiResponsesError: MockProviderError },
    '@/modules/openai/responses-client.server': { getOpenAiResponsesClient: () => ({
      createStructuredResponse: async (input: { parse: (value: unknown) => unknown }) => {
        providerCalls += 1; events.push('provider');
        if (options.providerError) throw options.providerError;
        return { data: input.parse(offlineAnalysis), requestId: 'offline-request' };
      },
    }) },
    '@/modules/product-images/product-image-service.server': { ProductImagePersistenceError: class extends Error {}, persistDetectedProductImages: async (_actor: string, identity: Record<string, unknown>) => {
      assert.deepEqual(Object.keys(identity).sort(), ['productId', 'projectId', 'workspaceId']);
      assert.equal(identity.productId, identityA.productId); events.push('images');
    } },
    '@/modules/ai-usage/composition.server': { enforceRateLimit: async () => {}, getAiUsageService: () => ({ reserve: async () => { reservations += 1; return {}; } }) },
    '@/modules/ai-usage/domain': { AiProtectionError: MockProtectionError, secureKey: () => 'offline-secure-key' },
    '@/modules/ai-usage/service': { runReservedAiOperation: async (input: { execute: () => Promise<{ value: unknown }> }) => (await input.execute()).value },
    'server-only': {},
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const routePath = fileURLToPath(new URL('./route.ts', import.meta.url));
  function loadModule(filename: string): Record<string, unknown> {
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const compiledModule = { exports: {} as Record<string, unknown> }; modules.set(filename, compiledModule);
    const requireMock = (specifier: string) => {
      if (specifier in mocks) return mocks[specifier];
      if (specifier === 'zod' || specifier.startsWith('node:')) return realRequire(specifier);
      const target = specifier.startsWith('@/') ? path.join(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      assert.ok(target.startsWith(sourceRoot), 'Offline harness imports must remain within source.');
      return loadModule(target.endsWith('.ts') ? target : `${target}.ts`);
    };
    const source = readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, {
      module: compiledModule, exports: compiledModule.exports, require: requireMock,
      process: { env: { OPENAI_API_KEY: 'offline-placeholder' } }, crypto: { randomUUID: () => operationRequestId },
      Request, Response, URL, TextDecoder, Uint8Array, Error,
      console: { error: () => {}, warn: () => {}, log: () => {} },
      fetch: () => { throw new Error('Network forbidden in recovery regression tests.'); },
    }, { filename });
    return compiledModule.exports;
  }
  const route = loadModule(routePath);
  const post = async (source: 'product-url' | 'raw-specifications' = 'raw-specifications', identity = identityA) => {
    const body = source === 'raw-specifications'
      ? { source, specifications: 'Synthetic Model A LCD television, 4K, 60 Hz.', productIdentity: identity, operationRequestId }
      : { source, url: 'https://manufacturer.example/product', productIdentity: identity, operationRequestId };
    const response = await (route.POST as (request: Request) => Promise<Response>)(new Request('http://offline.invalid/api/analyze', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }));
    events.push('response'); return response;
  };
  return { post, records, lookups, saves, events, saveEntered, releaseSave, counts: () => ({ extractionCalls, providerCalls, reservations }) };
}

test('403 analysis gives actionable same-Product recovery and preserves saved work without AI or writes', async () => {
  const harness = routeHarness({ extractionError: new MockExtractionError() });
  const before = structuredClone(harness.records.get(identityA.productId));
  const response = await harness.post('product-url'); const payload = await response.json();
  assert.equal(response.status, 502); assert.equal(payload.code, 'PRODUCT_PAGE_ACCESS_DENIED');
  assert.equal(payload.recoveryAction, 'PASTE_PRODUCT_INFORMATION'); assert.match(payload.error, /paste|pasted/iu);
  assert.deepEqual(harness.records.get(identityA.productId), before); assert.equal(harness.saves.length, 0);
  assert.deepEqual(harness.counts(), { extractionCalls: 1, providerCalls: 0, reservations: 0 });
});

test('provider failure during reanalysis preserves the previously saved analysis, draft, and version', async () => {
  const harness = routeHarness({ providerError: new MockProviderError('Synthetic timeout.') });
  const before = structuredClone(harness.records.get(identityA.productId));
  assert.equal((await harness.post()).status, 504);
  assert.deepEqual(harness.records.get(identityA.productId), before); assert.equal(harness.saves.length, 0);
});

for (const source of ['raw-specifications', 'product-url'] as const) {
  test(`${source} analysis waits for authoritative persistence and returns the new saved Product version`, async () => {
    const harness = routeHarness({ blockSave: true });
    const previousDraft = structuredClone(harness.records.get(identityA.productId)?.generatedListing);
    const responsePromise = harness.post(source);
    const first = await Promise.race([responsePromise.then(() => 'response'), harness.saveEntered.promise.then(() => 'saving')]);
    assert.equal(first, 'saving', 'Analysis must not report success before the save starts and completes.');
    assert.equal(harness.events.includes('response'), false); harness.releaseSave.resolve();
    const response = await responsePromise; const payload = await response.json();
    assert.equal(response.status, 200); assert.equal(harness.saves.length, 1);
    assert.equal(payload.savedProduct.version, identityA.version + 1); assert.ok(payload.savedProduct.analysisData);
    assert.deepEqual(payload.savedProduct.generatedListing, previousDraft);
    assert.equal(payload.imageDiscoveryWarning, undefined);
    for (const field of ['version', 'workspaceId', 'projectId', 'productId'] as const) assert.equal(harness.saves[0][field], identityA[field]);
    assert.ok(harness.events.indexOf('save-complete') < harness.events.indexOf('response'));
  });
}

test('same-Product pasted fallback after 403 saves only the intended Product and survives an independent reload lookup', async () => {
  const harness = routeHarness({ extractionError: new MockExtractionError() });
  assert.equal((await harness.post('product-url')).status, 502);
  const productBBefore = structuredClone(harness.records.get(identityB.productId));
  const response = await harness.post('raw-specifications', identityA); assert.equal(response.status, 200);
  const payload = await response.json(); assert.equal(harness.saves[0]?.productId, identityA.productId);
  assert.equal(harness.counts().extractionCalls, 1, 'Paste fallback must not fetch the blocked URL again.');
  const reloaded = harness.records.get(identityA.productId); assert.equal(reloaded?.version, identityA.version + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(reloaded?.analysisData)), payload.savedProduct.analysisData);
  assert.deepEqual(harness.records.get(identityB.productId), productBBefore);
});

test('save-time optimistic concurrency conflict returns 409 and does not claim successful analysis', async () => {
  const harness = routeHarness({ saveError: new MockProjectError('PROJECT_STALE_WRITE', 'Product changed before saving.', 409) });
  const before = structuredClone(harness.records.get(identityA.productId));
  const response = await harness.post(); assert.equal(response.status, 409);
  assert.deepEqual(harness.records.get(identityA.productId), before);
  const payload = await response.json(); assert.equal(payload.savedProduct, undefined); assert.equal(payload.code, 'PROJECT_STALE_WRITE');
});

test('stale incoming version is rejected before extraction, AI, or analysis persistence', async () => {
  const harness = routeHarness(); assert.equal((await harness.post('product-url', { ...identityA, version: 2 })).status, 409);
  assert.deepEqual(harness.counts(), { extractionCalls: 0, providerCalls: 0, reservations: 0 }); assert.equal(harness.saves.length, 0);
});

test('unauthenticated and unauthorized Product requests never reach extraction, AI, or save', async () => {
  const unauthenticated = routeHarness({ user: null }); assert.equal((await unauthenticated.post('product-url')).status, 401);
  const forbidden = routeHarness({ accessError: new MockProjectError('PROJECT_FORBIDDEN', 'OWNER access required.', 403) });
  assert.equal((await forbidden.post('product-url')).status, 403);
  for (const harness of [unauthenticated, forbidden]) {
    assert.deepEqual(harness.counts(), { extractionCalls: 0, providerCalls: 0, reservations: 0 }); assert.equal(harness.saves.length, 0);
  }
});

test('cross-workspace Product identity cannot read or overwrite either Product', async () => {
  const harness = routeHarness(); const before = structuredClone([...harness.records]);
  assert.equal((await harness.post('product-url', { ...identityB, workspaceId: '66666666-6666-4666-8666-666666666666' })).status, 404);
  assert.deepEqual([...harness.records], before);
  assert.deepEqual(harness.counts(), { extractionCalls: 0, providerCalls: 0, reservations: 0 }); assert.equal(harness.saves.length, 0);
});
