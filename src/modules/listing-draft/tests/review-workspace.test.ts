import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ListingDraftEngine } from '../builder/draft-engine.ts';
import { ListingDraftRegenerationEngine } from '../builder/regeneration-engine.ts';
import type { ListingDraft } from '../domain/contracts.ts';
import { ListingDraftError } from '../domain/errors.ts';
import type { PartialGenerationOutput } from '../domain/regeneration-contracts.ts';
import { listingDraftSchema } from '../validation/draft-schema.ts';
import {
  comparisonDiff,
  confidenceBreakdown,
  fieldReviewStatus,
  merchantFriendlyWarning,
  reviewWorkspaceForDraft,
} from '../review/review-model.ts';
import { confidenceLabel, listingReviewProgress } from '../review/review-workspace.ts';
import { draftInstructions, validProviderOutput } from './fixtures.ts';

async function generatedDraft(): Promise<ListingDraft> {
  const instructions = draftInstructions();
  return new ListingDraftEngine({
    provider: { generate: async () => ({ output: validProviderOutput(instructions), requestId: 'req_full' }) },
    now: () => '2026-08-09T00:00:00.000Z',
  }).generate(instructions);
}

function partialProvider(output: PartialGenerationOutput) {
  let calls = 0;
  return {
    get calls() { return calls; },
    regenerate: async () => {
      calls += 1;
      return { output, requestId: 'req_partial' };
    },
  };
}

test('generated drafts contain merchant-friendly traceability and reusable review context', async () => {
  const draft = await generatedDraft();
  const workspace = draft.reviewWorkspace!;
  assert.ok(workspace.facts.length > 0);
  assert.ok(workspace.traceability.some(({ fieldKey }) => fieldKey === 'title'));
  assert.ok(workspace.traceability.some(({ fieldKey }) => fieldKey === 'seo.title'));
  assert.ok(workspace.advanced.localization.length > 0);
  assert.ok(workspace.advanced.publishingConstraints.includes('Nothing is published during review.'));
  assert.equal(JSON.stringify(workspace).includes('sourceReferences'), false);
  assert.equal(JSON.stringify(workspace).includes('evidenceReferences'), false);
});

test('partial title regeneration changes only title and records comparison', async () => {
  const draft = await generatedDraft();
  const facts = new Map(draft.reviewWorkspace!.facts.map((fact) => [fact.label, fact]));
  const brand = facts.get('Brand')!;
  const model = facts.get('Model')!;
  const productType = facts.get('Product Type')!;
  const provider = partialProvider({
    section: 'TITLE',
    title: { value: `${productType.value} ${brand.value} ${model.value}`, factIds: [productType.factId, brand.factId, model.factId] },
  });
  const next = await new ListingDraftRegenerationEngine(provider, () => '2026-08-09T01:00:00.000Z')
    .regenerate(draft, 'TITLE');
  assert.equal(provider.calls, 1);
  assert.notEqual(next.title.value, draft.title.value);
  assert.deepEqual(next.overview, draft.overview);
  assert.deepEqual(next.features, draft.features);
  assert.equal(next.reviewWorkspace?.comparison?.section, 'TITLE');
  assert.deepEqual(next.reviewWorkspace?.comparison?.changedFields, ['title']);
});

test('locked sections never regenerate and locked description fields survive partial regeneration', async () => {
  const draft = await generatedDraft();
  const titleLocked = structuredClone(draft) as ListingDraft;
  (titleLocked as { reviewWorkspace: NonNullable<ListingDraft['reviewWorkspace']> }).reviewWorkspace = {
    ...draft.reviewWorkspace!, lockedFields: ['title'],
  };
  const titleProvider = partialProvider({ section: 'TITLE', title: draft.title });
  await assert.rejects(
    new ListingDraftRegenerationEngine(titleProvider).regenerate(titleLocked, 'TITLE'),
    (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_GENERATION_BLOCKED',
  );
  assert.equal(titleProvider.calls, 0);

  const descriptionLocked = structuredClone(draft) as ListingDraft;
  (descriptionLocked as { reviewWorkspace: NonNullable<ListingDraft['reviewWorkspace']> }).reviewWorkspace = {
    ...draft.reviewWorkspace!, lockedFields: ['overview', 'specifications'],
  };
  const descriptionProvider = partialProvider({
    section: 'DESCRIPTION',
    overview: draft.overview,
    specifications: draft.specifications,
    whatsIncluded: draft.whatsIncluded,
  });
  const next = await new ListingDraftRegenerationEngine(descriptionProvider).regenerate(descriptionLocked, 'DESCRIPTION');
  assert.deepEqual(next.overview, draft.overview);
  assert.deepEqual(next.specifications, draft.specifications);
});

test('feature and SEO regeneration boundaries preserve locked merchant fields', async () => {
  const draft = await generatedDraft();
  const locked = structuredClone(draft) as ListingDraft;
  (locked as { reviewWorkspace: NonNullable<ListingDraft['reviewWorkspace']> }).reviewWorkspace = {
    ...draft.reviewWorkspace!, lockedFields: ['features.0', 'seo.handle'], editedFields: ['features.0', 'seo.handle'],
  };
  const featureProvider = partialProvider({ section: 'FEATURES', features: draft.features.slice(1) });
  const features = await new ListingDraftRegenerationEngine(featureProvider).regenerate(locked, 'FEATURES');
  assert.deepEqual(features.features[0], draft.features[0]);

  const seoProvider = partialProvider({ section: 'SEO', seo: draft.seo });
  const seo = await new ListingDraftRegenerationEngine(seoProvider).regenerate(locked, 'SEO');
  assert.deepEqual(seo.seo.handle, draft.seo.handle);
  assert.ok(seo.reviewWorkspace?.comparison?.merchantEditedFields.includes('seo.handle'));
});

test('partial regeneration rejects unapproved facts and malformed factual claims', async () => {
  const draft = await generatedDraft();
  const provider = partialProvider({
    section: 'TITLE',
    title: { value: 'Invented Product 9999', factIds: ['unknown-fact'] },
  });
  await assert.rejects(
    new ListingDraftRegenerationEngine(provider).regenerate(draft, 'TITLE'),
    (error: unknown) => error instanceof ListingDraftError && error.code === 'DRAFT_FORBIDDEN_FACT',
  );
});

test('confidence labels, breakdown, warnings, review progress and comparison are understandable', async () => {
  assert.equal(confidenceLabel(97), 'Excellent');
  assert.equal(confidenceLabel(85), 'High');
  assert.equal(confidenceLabel(70), 'Medium');
  assert.equal(confidenceLabel(40), 'Low');
  assert.equal(confidenceLabel(99, true), 'Blocked');
  assert.equal(listingReviewProgress([]), 0);
  assert.equal(listingReviewProgress(['TITLE', 'SEO', 'MEDIA', 'CATALOG']), 50);
  assert.deepEqual(comparisonDiff('old\nshared', 'new\nshared'), {
    removed: ['old'], added: ['new'], unchanged: ['shared'],
  });
  assert.equal(merchantFriendlyWarning('AI:INVENT_WARRANTY_TERMS'), 'INVENT WARRANTY TERMS');
  const draft = await generatedDraft();
  const breakdown = confidenceBreakdown(listingDraftSchema.parse(draft));
  assert.ok(breakdown.verified > 0);
  assert.equal(breakdown.blocked, 0);
});

test('merchant edits, locks and reviewed sections remain valid persisted draft state', async () => {
  const draft = listingDraftSchema.parse(await generatedDraft());
  const workspace = reviewWorkspaceForDraft(draft);
  const edited = listingDraftSchema.parse({
    ...draft,
    status: 'EDITED',
    title: { ...draft.title, value: draft.title.value },
    reviewWorkspace: {
      ...workspace,
      editedFields: ['title'],
      lockedFields: ['title', 'seo.handle'],
      reviewedSections: ['TITLE', 'SEO'],
    },
  });
  assert.equal(fieldReviewStatus(edited.reviewWorkspace!, 'title'), 'Merchant Edited');
  assert.deepEqual(edited.reviewWorkspace?.lockedFields, ['title', 'seo.handle']);
  assert.deepEqual(edited.reviewWorkspace?.reviewedSections, ['TITLE', 'SEO']);
});

test('review workspace delegates navigation to top-level tabs without losing review controls', async () => {
  const source = await readFile(new URL('../review/ListingDraftReview.tsx', import.meta.url), 'utf8');
  for (const required of [
    "view === 'LISTING'", "view === 'REVIEW'", "view === 'ADVANCED'",
    'role="dialog"', "event.key === 'Escape'", 'Merchant Review Workspace',
    'Listing Review', 'Why?', 'Save Draft', 'Product Truth', 'Listing Craft', 'Publishing Constraints',
    'Shopify approval readiness', 'Approve and save draft', 'Review SEO and catalog',
  ]) assert.ok(source.includes(required), `missing review behavior: ${required}`);
  for (const removed of ['window.localStorage', 'role="tablist"', 'Draft review sections']) {
    assert.equal(source.includes(removed), false, `redundant nested navigation remains: ${removed}`);
  }
});

test('regeneration API reuses stored draft without upstream recalculation or Shopify mutation', async () => {
  const service = await readFile(new URL('../persistence/project-draft-service.server.ts', import.meta.url), 'utf8');
  const start = service.indexOf('export async function regenerateProjectListingDraft');
  const regeneration = service.slice(start);
  assert.ok(regeneration.includes('project.generatedListing?.listingDraft'));
  assert.ok(regeneration.includes('ListingDraftRegenerationEngine'));
  assert.equal(regeneration.includes('generationContext('), false);
  assert.equal(regeneration.includes('createGenerationInstructions'), false);
  assert.equal(regeneration.includes('createProjectListingGenerationPlan'), false);
  assert.equal(regeneration.includes('createProductTruth'), false);
  assert.equal(regeneration.includes('analyzeProductIntelligence'), false);
  assert.equal(regeneration.includes('shopify'), false);
});

test('workspace autosave includes current draft review state and keeps manual save', async () => {
  const source = await readFile(new URL('../../../components/workspace/ListingWorkspace.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('listingDraftProjectFields(listingDraft)'));
  assert.ok(source.includes('generatedListing: persistedDraftFields?.generatedListing ?? null'));
  assert.ok(source.includes('useProjectAutosave'));
  assert.ok(source.includes('onSave={handleSaveDraft}'));
  assert.ok(source.includes('onRegenerate={handleRegenerateDraft}'));
  assert.equal(source.includes('persistedListingDraft'), false);
});
