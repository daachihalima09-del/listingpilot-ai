import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { ListingDraftError } from '../domain/errors.ts';
import { generateAndPersistListingDraft } from '../persistence/generation-lifecycle.ts';
import { generatedListingReadiness } from '../persistence/authoritative-draft-state.ts';

function generationService(readinessData: Record<string, unknown>) {
  const calls = { provider: 0, save: 0, reserve: 0 };
  const product = { id: 'product-a', projectId: 'project', workspaceId: 'workspace', version: 7, status: 'DRAFT', analysisData: { activeProduct: {} }, readinessData, generatedListing: { listingDraft: { draftId: 'previous' } } };
  const dependencies: Record<string, unknown> = {
    'server-only': {},
    '../../generation-instructions/index.ts': { createGenerationInstructions: () => ({ instructionFingerprint: 'offline' }) },
    '../../listing-generation/index.ts': { createProjectListingGenerationPlan: () => ({ generationStatus: 'READY' }), canonicalGenerationEligibility: () => ({ canGenerate: true }) },
    '../../merchant-preferences/composition.server.ts': { createServerMerchantPreferenceService: () => ({ getProfile: async () => ({}), getEffectivePreferences: async () => ({}) }) },
    '../../onboarding/listing-profile/listing-profile-context.server.ts': { resolveMerchantListingProfileAccess: async () => {} },
    '../../projects/server/project-operations.ts': {},
    '../../products/services/product-service.server.ts': { getUserProduct: async () => product, saveUserProductState: async (_actor: unknown, state: { productId: string; readinessData: { listingEvidenceStale: boolean } }, options: { refreshListingEvidence: boolean }) => {
      calls.save += 1; assert.equal(state.productId, 'product-a'); assert.equal(options.refreshListingEvidence, true); assert.equal(state.readinessData.listingEvidenceStale, false); return { version: 8 };
    } },
    '../adapter/openai-generation-provider.server.ts': { createOpenAiGenerationProvider: () => ({}) },
    '../adapter/openai-regeneration-provider.server.ts': {},
    '../builder/draft-engine.ts': { ListingDraftEngine: class { async generate() { calls.provider += 1; return { providerRequestId: null }; } } },
    '../builder/regeneration-engine.ts': {}, '../domain/errors.ts': { ListingDraftError }, '../validation/draft-schema.ts': {},
    './draft-persistence.ts': { listingDraftProjectFields: () => ({ generatedListing: { listingDraft: { draftId: 'replacement' } }, seoData: {} }) },
    './authoritative-draft-state.ts': { generatedListingReadiness }, './generation-lifecycle.ts': { generateAndPersistListingDraft },
    '../../ai-usage/composition.server.ts': { getAiUsageService: () => ({ reserve: async () => { calls.reserve += 1; return {}; } }) },
    '../../ai-usage/domain.ts': { secureKey: () => 'offline' }, '../../ai-usage/service.ts': { runReservedAiOperation: async ({ execute }: { execute: () => Promise<{ value: unknown }> }) => (await execute()).value },
  };
  const exports: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {};
  const source = readFileSync(new URL('../persistence/project-draft-service.server.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require(name: string) { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; }, Date,
  });
  return { calls, product, service: exports };
}
const request = { actorUserId: 'owner', workspaceId: 'workspace', containerProjectId: 'project', projectId: 'product-a', version: 7, operationRequestId: 'offline' };

test('pending replacement analysis blocks generation before provider, usage reservation, or draft persistence', async () => {
  const context = generationService({ analysisPending: true });
  await assert.rejects(context.service.generateProjectListingDraft(request), (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_GENERATION_BLOCKED' && error.statusCode === 409);
  assert.deepEqual(context.calls, { provider: 0, save: 0, reserve: 0 });
  assert.equal(context.product.generatedListing.listingDraft.draftId, 'previous');
});

test('retained stale drafts cannot be saved or section-regenerated against replacement evidence', async () => {
  const context = generationService({ listingEvidenceStale: true });
  for (const action of ['saveProjectListingDraft', 'regenerateProjectListingDraft']) {
    await assert.rejects(context.service[action]({ ...request, section: 'SEO', draft: {} }), (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_STALE_WRITE' && error.statusCode === 409);
  }
  assert.deepEqual(context.calls, { provider: 0, save: 0, reserve: 0 });
});

test('fresh full generation may replace a retained stale draft through the trusted evidence-refresh save', async () => {
  const context = generationService({ analysisPending: false, listingEvidenceStale: true });
  await context.service.generateProjectListingDraft(request);
  assert.deepEqual(context.calls, { provider: 1, save: 1, reserve: 1 });
});
