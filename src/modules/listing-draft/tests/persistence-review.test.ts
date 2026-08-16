import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import {
  assertListingDraftSaveIdentity,
  listingDraftProjectFields,
  prepareListingDraftForSave,
} from '../persistence/draft-persistence.ts';
import { readAuthoritativeListingDraft } from '../persistence/authoritative-draft-state.ts';
import { ListingDraftError } from '../domain/errors.ts';
import type { ListingDraftInput } from '../validation/draft-schema.ts';
import { draftInstructions, validProviderOutput } from './fixtures.ts';

test('merchant edits remain editable and save as an internal project draft', async () => {
  const instructions = draftInstructions();
  const generated = await new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: 'req_save' }) },
    now: () => '2026-08-08T00:00:00.000Z',
  }).generate(instructions);
  const edited = JSON.parse(JSON.stringify(generated)) as ListingDraftInput;
  edited.title.value = 'Acme Television X1000';
  edited.title.factIds = instructions.allowedFacts
    .filter(({ fieldId }) => ['brand', 'product_type', 'model'].includes(fieldId))
    .map(({ factId }) => factId);
  edited.reviewNotes = ['Merchant reviewed this draft.'];
  const saved = prepareListingDraftForSave(edited, instructions, '2026-08-08T01:00:00.000Z');
  const fields = listingDraftProjectFields(saved);
  assert.equal(saved.status, 'SAVED');
  assert.equal(saved.metadata.merchantEdited, true);
  assert.equal(fields.generatedListing.listingDraft.draftId, generated.draftId);
  assert.equal(fields.generatedListing.title, edited.title.value);
  assert.equal(fields.seoData.seoTitle, edited.seo.title.value);
  assert.deepEqual(readAuthoritativeListingDraft(fields.generatedListing), saved);
});

test('Product-scoped draft save uses the Product route and Product repository without Project fallback', async () => {
  const productRoute = await readFile(new URL('../../../app/api/projects/[projectId]/products/[productId]/listing-draft/route.ts', import.meta.url), 'utf8');
  const sharedRoute = await readFile(new URL('../../../app/api/projects/[projectId]/listing-draft/route.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../persistence/project-draft-service.server.ts', import.meta.url), 'utf8');
  assert.match(productRoute, /export \{ GET, PATCH, POST, PUT \}/u);
  assert.match(sharedRoute, /containerProjectId: productId \? projectId : undefined/u);
  assert.match(service, /saveUserProductState\(input\.actorUserId, \{ \.\.\.state, projectId: input\.containerProjectId, productId: input\.projectId \}\)/u);
  assert.match(service, /context\.project\.generatedListing\?\.listingDraft/u);
});

test('a stored draft can be edited after a project version increment while unrelated stale drafts are rejected', async () => {
  const instructions = draftInstructions();
  const draft = await new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: null }) },
  }).generate(instructions);
  assert.doesNotThrow(() => assertListingDraftSaveIdentity(draft, {
    projectId: draft.projectId,
    workspaceId: draft.workspaceId,
    instructionFingerprint: 'new-instruction-fingerprint',
    persistedDraftId: draft.draftId,
  }));
  assert.throws(() => assertListingDraftSaveIdentity(draft, {
    projectId: draft.projectId,
    workspaceId: draft.workspaceId,
    instructionFingerprint: 'new-instruction-fingerprint',
    persistedDraftId: 'different-draft',
  }), ListingDraftError);
});

test('review screen exposes every draft section and save action without publishing', async () => {
  const source = await readFile(new URL('../review/ListingDraftReview.tsx', import.meta.url), 'utf8');
  for (const label of [
    'Product Title', 'Description', 'Product Information', 'Key Features', 'SEO', 'Catalog',
    'Metafields', 'Alt Text', 'Confidence', 'Save Draft',
  ]) assert.ok(source.includes(label), `missing review section: ${label}`);
  assert.equal(source.includes('publishProduct'), false);
  assert.equal(source.includes('/api/shopify'), false);
});

test('draft engine architecture consumes Generation Instructions without upstream data access', async () => {
  const source = await readFile(new URL('../builder/draft-engine.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('product-truth'), false);
  assert.equal(source.includes('merchant-preferences'), false);
  assert.equal(source.includes('product-intelligence'), false);
  assert.equal(source.includes('shopify'), false);
  assert.equal(source.includes('OpenAI'), false);
  assert.ok(source.includes('GenerationInstructions'));
});

test('generate and save API is authenticated and delegates OWNER enforcement before persistence', async () => {
  const route = await readFile(new URL('../../../app/api/projects/[projectId]/listing-draft/route.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../persistence/project-draft-service.server.ts', import.meta.url), 'utf8');
  assert.ok(route.includes('getCurrentUser'));
  assert.ok(route.includes('if (!user) return unauthenticated()'));
  assert.ok(service.includes('resolveMerchantListingProfileAccess(actorUserId, workspaceId, true)'));
  assert.ok(service.includes('assertListingDraftSaveIdentity'));
  assert.equal(
    service.includes('sourceInstructionFingerprint: context.instructions.instructionFingerprint'),
    false,
  );
  assert.ok(service.includes('saveUserProjectState'));
  assert.equal(service.includes('/api/shopify'), false);
});
