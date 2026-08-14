import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import { ListingDraftError } from '../domain/errors.ts';
import {
  generatedListingReadiness,
  listingDraftProjectFields,
  readAuthoritativeListingDraft,
} from '../persistence/authoritative-draft-state.ts';
import { generateAndPersistListingDraft } from '../persistence/generation-lifecycle.ts';
import { draftInstructions, validProviderOutput } from './fixtures.ts';

async function draft() {
  const instructions = draftInstructions();
  return new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: 'req_lifecycle' }) },
  }).generate(instructions);
}

test('only a valid embedded Listing Draft is authoritative', async () => {
  assert.equal(readAuthoritativeListingDraft(null), null);
  assert.equal(readAuthoritativeListingDraft({ title: 'Fallback', description: 'Not a draft', keyFeatures: 'Fake' }), null);
  const generated = await draft();
  const fields = listingDraftProjectFields(generated);
  assert.equal(readAuthoritativeListingDraft(fields.generatedListing)?.draftId, generated.draftId);
});

test('successful generation returns only after authoritative persistence and is reloadable', async () => {
  const generated = await draft();
  let persistedListing: unknown = null;
  const result = await generateAndPersistListingDraft({
    expectedVersion: 4,
    currentVersion: 4,
    generate: async () => generated,
    persist: async (value) => {
      persistedListing = listingDraftProjectFields(value).generatedListing;
      return { version: 5 };
    },
  });
  assert.equal(result.project.version, 5);
  assert.equal(result.draft.draftId, generated.draftId);
  assert.equal(readAuthoritativeListingDraft(persistedListing)?.draftId, generated.draftId);
});

test('provider or persistence failure exposes no authoritative partial draft and permits retry', async () => {
  const generated = await draft();
  let persistedListing: unknown = null;
  await assert.rejects(generateAndPersistListingDraft({
    expectedVersion: 1, currentVersion: 1,
    generate: async () => { throw new Error('provider failed'); },
    persist: async (value) => { persistedListing = listingDraftProjectFields(value).generatedListing; return { version: 2 }; },
  }));
  assert.equal(persistedListing, null);
  await assert.rejects(generateAndPersistListingDraft({
    expectedVersion: 1, currentVersion: 1,
    generate: async () => generated,
    persist: async () => { throw new Error('persistence failed'); },
  }));
  assert.equal(persistedListing, null);
  const retry = await generateAndPersistListingDraft({
    expectedVersion: 1, currentVersion: 1,
    generate: async () => generated,
    persist: async (value) => { persistedListing = listingDraftProjectFields(value).generatedListing; return { version: 2 }; },
  });
  assert.equal(retry.project.version, 2);
  assert.ok(persistedListing);
});

test('stale and concurrent generation cannot overwrite the winning persisted draft', async () => {
  const generated = await draft();
  let version = 3;
  const persist = async () => {
    if (version !== 3) throw new ListingDraftError('DRAFT_STALE_WRITE', 'stale', 409);
    version += 1;
    return { version };
  };
  const results = await Promise.allSettled([
    generateAndPersistListingDraft({ expectedVersion: 3, currentVersion: 3, generate: async () => generated, persist }),
    generateAndPersistListingDraft({ expectedVersion: 3, currentVersion: 3, generate: async () => generated, persist }),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  await assert.rejects(generateAndPersistListingDraft({ expectedVersion: 3, currentVersion: 4, generate: async () => generated, persist }), ListingDraftError);
});

test('generation readiness makes Listing generated and Review ready without marking review complete', () => {
  const readiness = generatedListingReadiness({ analysisStarted: true, activeStage: 'generate', completedStages: ['input', 'extract', 'verify'], shopifyReady: true });
  assert.equal(readiness.activeStage, 'review');
  assert.equal(readiness.completedStages.includes('generate'), true);
  assert.equal(readiness.completedStages.includes('review'), false);
  assert.equal(readiness.shopifyReady, false);
});

test('workspace renders no project listing editor without an authoritative draft and reconciles persisted responses', async () => {
  const source = await readFile(new URL('../../../components/workspace/ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('!listingDraft ? <GeneratedListing'), false);
  assert.match(source, /initialProject[\s\S]*listingDraft \? current : emptyListingContent[\s\S]*: listing/);
  assert.match(source, /generatedListing: persistedDraftFields\?\.generatedListing \?\? null/);
  assert.match(source, /version: projectSave\.currentVersion/);
  assert.match(source, /projectSave\.adoptExternalSave\(response\.project\.version, savedSnapshot\)/);
  assert.match(source, /generationRequestRef\.current/);
  assert.match(source, /Using your saved Listing Style at generation time/);
});

test('generation route persists before responding and returns authoritative version state', async () => {
  const route = await readFile(new URL('../../../app/api/projects/[projectId]/listing-draft/route.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../persistence/project-draft-service.server.ts', import.meta.url), 'utf8');
  assert.match(route, /version: input\.version/);
  assert.match(route, /project: \{ version: result\.project\.version/);
  assert.match(service, /generateAndPersistListingDraft/);
  assert.match(service, /saveUserProjectState/);
  assert.match(service, /listingDraftProjectFields\(draft\)/);
});
