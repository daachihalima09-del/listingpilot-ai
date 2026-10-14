import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url));
const realRequire = createRequire(import.meta.url);
const scope = { workspaceId: '11111111-1111-4111-8111-111111111111', projectId: '22222222-2222-4222-8222-222222222222' };
const productA = '33333333-3333-4333-8333-333333333333';
const productB = '44444444-4444-4444-8444-444444444444';
const analysis = {
  activeProduct: {
    brand: 'Synthetic', model: 'Synthetic A', panel: '', hdr: '', refreshRate: '', resolution: '', smartPlatform: '', warranty: '',
    truthRows: [], sources: [], analyses: [],
    conflict: { label: '', official: '', amazon: '', lg: '', recommendation: '', recommendedValue: '', explanation: '' },
    catalogHealth: { score: 90, label: 'Good', items: [] },
  }, truthRows: [], analysisContext: { sourceLabel: 'Product URL', notice: 'Synthetic source' }, conflictResolved: false,
};
const originalListing = { title: 'Saved synthetic listing', description: 'Saved description', keyFeatures: 'Saved feature' };
const originalSeo = { seoTitle: 'Saved SEO', seoDescription: 'Saved SEO description', tags: 'synthetic' };
const readiness = { analysisStarted: true, activeStage: 'review', completedStages: ['input', 'extract', 'verify', 'generate'], shopifyReady: true };
type Row = Record<string, unknown> & { id: string; version: number };

function fixture(id: string): Row {
  return {
    id, ...scope, version: 3, name: 'Synthetic Product', status: 'READY', productType: null, collection: null,
    sourceType: 'PRODUCT_URL', sourceUrl: 'https://manufacturer.example/original', rawInput: null,
    analysisData: structuredClone(analysis), generatedListing: structuredClone(originalListing), seoData: structuredClone(originalSeo),
    readinessData: structuredClone(readiness), archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function serviceHarness(options: { role?: string; noMembership?: boolean; archived?: boolean; auditFailure?: boolean } = {}) {
  const rows = new Map<string, Row>([[productA, fixture(productA)], [productB, fixture(productB)]]);
  if (options.archived) rows.get(productA)!.archivedAt = new Date('2026-01-02T00:00:00.000Z');
  const audits: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const transactionOptions: unknown[] = [];
  const dbNull = Symbol('offlineDbNull');
  const tx = {
    membership: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const organization = where.organization as { workspaces: { some: { id: string } } };
      return options.noMembership || organization.workspaces.some.id !== scope.workspaceId ? null : { organizationId: 'offline-organization', role: options.role ?? 'OWNER' };
    } },
    project: { findFirst: async ({ where }: { where: Record<string, unknown> }) => where.id === scope.projectId && where.workspaceId === scope.workspaceId
      ? { id: scope.projectId, defaultProductType: null, defaultCollection: null } : null },
    product: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = rows.get(String(where.id));
        return row && Object.entries(where).every(([key, value]) => row[key] === value) ? structuredClone(row) : null;
      },
      updateMany: async (input: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updates.push(input);
        const row = rows.get(String(input.where.id));
        if (!row || !Object.entries(input.where).every(([key, value]) => row[key] === value)) return { count: 0 };
        for (const [key, value] of Object.entries(input.data)) {
          if (key === 'version') row.version += (value as { increment: number }).increment;
          else row[key] = value === dbNull ? null : value;
        }
        return { count: 1 };
      },
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
      if (options.auditFailure) throw new Error('Synthetic audit persistence failure.');
      audits.push(data); return data;
    } },
  };
  const prisma = { $transaction: async (operation: (client: typeof tx) => Promise<unknown>, config: unknown) => {
    transactionOptions.push(config);
    const originalRows = structuredClone([...rows]); const originalAudits = structuredClone(audits);
    try { return await operation(tx); } catch (error) {
      rows.clear(); for (const [id, row] of originalRows) rows.set(id, row);
      audits.splice(0, audits.length, ...originalAudits); throw error;
    }
  } };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load(filename: string): Record<string, unknown> {
    const cached = modules.get(filename); if (cached) return cached.exports;
    const compiledModule = { exports: {} as Record<string, unknown> }; modules.set(filename, compiledModule);
    const requireMock = (specifier: string) => {
      if (specifier === 'server-only') return {};
      if (specifier === '@/lib/prisma') return { prisma };
      if (specifier === '@prisma/client') return { Prisma: { DbNull: dbNull, TransactionIsolationLevel: { Serializable: 'Serializable' } } };
      if (specifier === 'zod' || specifier.startsWith('node:')) return realRequire(specifier);
      const target = specifier.startsWith('@/') ? path.join(sourceRoot, specifier.slice(2)) : path.resolve(path.dirname(filename), specifier);
      assert.ok(target.startsWith(sourceRoot)); return load(target.endsWith('.ts') ? target : `${target}.ts`);
    };
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports, require: requireMock, URL, Date, Error, console: { error: () => {} } }, { filename });
    return compiledModule.exports;
  }
  const service = load(fileURLToPath(new URL('../services/product-service.server.ts', import.meta.url)));
  const saveAnalysis = (input: unknown) => (service.saveUserProductAnalysis as (actor: string, state: unknown) => Promise<Record<string, unknown>>)('offline-owner', input);
  const saveState = (input: unknown) => (service.saveUserProductState as (actor: string, state: unknown) => Promise<Record<string, unknown>>)('offline-owner', input);
  const stateInput = (overrides: Record<string, unknown> = {}) => ({
    ...scope, productId: productA, version: 3,
    sourceType: 'PRODUCT_URL', sourceUrl: 'https://manufacturer.example/original', rawInput: null,
    analysisData: structuredClone(analysis), generatedListing: structuredClone(originalListing), seoData: structuredClone(originalSeo), readinessData: structuredClone(readiness),
    ...overrides,
  });
  const analysisInput = (overrides: Record<string, unknown> = {}) => ({
    ...scope, productId: productA, version: 3, sourceType: 'RAW_SPECIFICATIONS', sourceUrl: null, rawInput: 'Synthetic replacement evidence',
    analysisData: { ...structuredClone(analysis), analysisContext: { sourceLabel: 'Raw specifications', notice: 'Replacement synthetic evidence' } }, ...overrides,
  });
  return { rows, audits, updates, transactionOptions, saveAnalysis, saveState, stateInput, analysisInput };
}

test('authoritative analysis uses scoped CAS, preserves draft/SEO, clears pending, and marks preserved evidence stale', async () => {
  const harness = serviceHarness(); const beforeB = structuredClone(harness.rows.get(productB));
  const saved = await harness.saveAnalysis(harness.analysisInput());
  assert.equal(saved.version, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.generatedListing)), originalListing);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.seoData)), originalSeo);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.updates[0].where)), { id: productA, ...scope, version: 3, archivedAt: null });
  assert.equal(Object.hasOwn(harness.updates[0].data, 'generatedListing'), false);
  assert.equal(Object.hasOwn(harness.updates[0].data, 'seoData'), false);
  const flags = saved.readinessData as Record<string, unknown>;
  assert.equal(flags.analysisPending, false); assert.equal(flags.listingEvidenceStale, true); assert.equal(flags.shopifyReady, false);
  assert.deepEqual(harness.rows.get(productB), beforeB);
  assert.equal(harness.audits.length, 1); assert.equal(harness.audits[0].action, 'product.analysis.saved');
  assert.equal((harness.transactionOptions[0] as { isolationLevel: string }).isolationLevel, 'Serializable');
});

test('analysis version conflict leaves both Products and audit history unchanged', async () => {
  const harness = serviceHarness(); const before = structuredClone([...harness.rows]);
  await assert.rejects(harness.saveAnalysis(harness.analysisInput({ version: 2 })), { code: 'PROJECT_STALE_WRITE', statusCode: 409 });
  assert.deepEqual([...harness.rows], before); assert.equal(harness.audits.length, 0);
});

test('source-change autosave cannot null saved analysis/draft/SEO and blocks stale evidence', async () => {
  const harness = serviceHarness(); const before = structuredClone(harness.rows.get(productA)!);
  const saved = await harness.saveState(harness.stateInput({ sourceUrl: 'https://manufacturer.example/replacement', analysisData: null, generatedListing: null, seoData: null }));
  for (const field of ['analysisData', 'generatedListing', 'seoData']) assert.deepEqual(JSON.parse(JSON.stringify(saved[field])), before[field]);
  assert.equal((saved.readinessData as Record<string, unknown>).analysisPending, true);
  assert.equal((saved.readinessData as Record<string, unknown>).shopifyReady, false);
  assert.equal(saved.sourceUrl, 'https://manufacturer.example/replacement');
});

test('ordinary autosave cannot clear pending/stale flags or make old work publishable', async () => {
  const harness = serviceHarness();
  harness.rows.get(productA)!.readinessData = { ...readiness, analysisPending: true, listingEvidenceStale: true, shopifyReady: false };
  const saved = await harness.saveState(harness.stateInput()); const flags = saved.readinessData as Record<string, unknown>;
  assert.equal(flags.analysisPending, true); assert.equal(flags.listingEvidenceStale, true); assert.equal(flags.shopifyReady, false);
});

test('OWNER authorization is enforced again at analysis persistence and state save', async () => {
  for (const role of ['EMPLOYEE', 'ADMIN']) {
    const harness = serviceHarness({ role }); const before = structuredClone([...harness.rows]);
    await assert.rejects(harness.saveAnalysis(harness.analysisInput()), { code: 'PROJECT_FORBIDDEN', statusCode: 403 });
    await assert.rejects(harness.saveState(harness.stateInput()), { code: 'PROJECT_FORBIDDEN', statusCode: 403 });
    assert.equal(harness.updates.length, 0); assert.equal(harness.audits.length, 0); assert.deepEqual([...harness.rows], before);
  }
});

test('cross-workspace and cross-Project analysis cannot read or update Product state', async () => {
  for (const identity of [{ workspaceId: '66666666-6666-4666-8666-666666666666' }, { projectId: '77777777-7777-4777-8777-777777777777' }]) {
    const harness = serviceHarness(); const before = structuredClone([...harness.rows]);
    await assert.rejects(harness.saveAnalysis(harness.analysisInput(identity)), { code: 'PROJECT_NOT_FOUND', statusCode: 404 });
    assert.equal(harness.updates.length, 0); assert.equal(harness.audits.length, 0); assert.deepEqual([...harness.rows], before);
  }
});

test('archived Product cannot be reanalyzed or have its retained work changed', async () => {
  const harness = serviceHarness({ archived: true }); const before = structuredClone([...harness.rows]);
  await assert.rejects(harness.saveAnalysis(harness.analysisInput()), { code: 'PROJECT_INVALID_LIFECYCLE', statusCode: 409 });
  assert.equal(harness.updates.length, 0); assert.deepEqual([...harness.rows], before);
});

test('analysis and audit save are atomic if audit persistence fails', async () => {
  const harness = serviceHarness({ auditFailure: true }); const before = structuredClone([...harness.rows]);
  await assert.rejects(harness.saveAnalysis(harness.analysisInput()), /Synthetic audit persistence failure/u);
  assert.deepEqual([...harness.rows], before); assert.equal(harness.audits.length, 0);
});
