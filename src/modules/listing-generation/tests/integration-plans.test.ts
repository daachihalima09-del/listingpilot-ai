import assert from 'node:assert/strict';
import test from 'node:test';
import { createListingGenerationPlan } from '../index.ts';
import { finding, generationInput, truthFindings } from './fixtures.ts';

test('fact selection preserves factual boundaries, use targets, variants and regions', () => {
  const facts = [...truthFindings(), finding('material', 'Metal', 'LIKELY'), finding('warranty', 'Five years', 'INSUFFICIENT_EVIDENCE'), finding('regional_variant', 'US', 'VERIFIED', { variantId: 'variant-us' })]; const plan = createListingGenerationPlan(generationInput({ findings: facts }));
  assert.equal(plan.selectedFacts.some(({ fieldId }) => fieldId === 'brand'), true); assert.equal(plan.excludedFacts.some(({ fieldId }) => fieldId === 'material'), true); assert.equal(plan.excludedFacts.some(({ fieldId }) => fieldId === 'warranty'), true);
  const regional = plan.selectedFacts.find(({ fieldId }) => fieldId === 'regional_variant'); assert.equal(regional?.variantId, 'variant-us'); assert.equal(regional?.productIntelligenceGuidance.regionalSensitivity, true);
  assert.equal(plan.selectedFacts.find(({ fieldId }) => fieldId === 'brand')?.allowedUses.includes('CATALOG_CLASSIFICATION'), true); assert.equal(plan.selectedFacts.every(({ productId }) => productId === plan.productId), true);
});
test('conflicted, unresolved, merchant override and AI-only evidence remain traceable', () => {
  const conflict = finding('refresh_rate', '60 Hz', 'CONFLICTED'); const unresolved = finding('material', '', 'UNRESOLVED'); const override = finding('finish', 'Black', 'MERCHANT_OVERRIDE'); const aiOnly = finding('compatibility', 'Universal', 'VERIFIED', { evidenceSummary: { evidenceCount: 1, independentSourceCount: 1, strongestAuthority: 'AI_DERIVED', missingProvenanceCount: 0 } });
  const plan = createListingGenerationPlan(generationInput({ findings: [...truthFindings(), conflict, unresolved, override, aiOnly] })); assert.equal(plan.conflictedFacts.some(({ fieldId }) => fieldId === 'refresh_rate'), true); assert.equal(plan.unresolvedFacts.some(({ fieldId }) => fieldId === 'material'), true); assert.equal(plan.excludedFacts.some(({ fieldId }) => fieldId === 'finish'), true); assert.equal(plan.excludedFacts.some(({ fieldId }) => fieldId === 'compatibility'), true);
});
test('Product Intelligence pack guidance drives priorities, SEO, metafields and safety without core category branches', () => {
  const plan = createListingGenerationPlan(generationInput()); assert.equal(plan.productIntelligencePack?.id, 'television'); assert.equal(plan.featurePlan.priorityGroups.length > 0, true); assert.equal((plan.seoPlan.titlePlan.componentPriority as string[]).includes('brand'), true); assert.equal(plan.metafieldPlan.entries.some(({ truthFieldId }) => truthFieldId === 'screen_size'), true); assert.equal(plan.prohibitedOutputs.includes('PACK_NEVER_INVENT:refresh_rate'), true);
  const generic = createListingGenerationPlan(generationInput({ pack: null })); assert.equal(generic.productIntelligencePack, null); assert.equal(generic.generationEligibility.allowed, true); assert.equal(generic.metafieldPlan.entries.length, 0);
});
test('Catalog plan uses approved values, separates Brand/Vendor and never creates catalog data', () => {
  const plan = createListingGenerationPlan(generationInput()); assert.equal(plan.catalogPlan.vendor, 'Northwind'); assert.equal(plan.catalogPlan.brand, 'Acme'); assert.equal(plan.catalogPlan.productType, 'Television'); assert.deepEqual(plan.catalogPlan.creationRequests, []);
  const unapproved = createListingGenerationPlan(generationInput({ mutate: (input) => (input.product as { vendor?: string }).vendor = 'Unknown Vendor' })); assert.equal(unapproved.catalogPlan.classificationStatus, 'REVIEW_REQUIRED'); assert.equal(unapproved.catalogPlan.unapprovedValues.includes('Unknown Vendor'), true); assert.deepEqual(unapproved.catalogPlan.creationRequests, []);
});
test('Listing Profile creates NEOVIX and Marketplace structural plans without content', () => {
  const neovix = createListingGenerationPlan(generationInput()); assert.deepEqual(neovix.titlePlan.componentOrder, ['BRAND', 'MODEL', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY']); assert.equal(neovix.descriptionPlan.structure, 'SPECIFICATIONS_FIRST'); assert.equal(neovix.descriptionPlan.sectionOrder[0], 'STRUCTURED_SPECIFICATIONS'); assert.equal(neovix.featurePlan.technicalFirst, true);
  const marketplace = createListingGenerationPlan(generationInput({ listingStandard: 'MARKETPLACE' })); assert.equal(marketplace.descriptionPlan.structure, 'OVERVIEW_FIRST'); assert.equal(marketplace.featurePlan.featureOrder, 'BENEFITS_FIRST'); assert.equal(typeof marketplace.titlePlan.lockedValue, 'object');
  assert.equal(JSON.stringify(neovix).includes('final title'), false);
});
test('legacy NEOVIX title order upgrades in memory without rewriting customized styles', () => {
  const legacy = createListingGenerationPlan(generationInput({ mutate(input) {
    input.merchantPreferences.listing.rules!.title.fieldOrder = ['BRAND', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY', 'MODEL'];
  } }));
  assert.deepEqual(legacy.titlePlan.componentOrder, ['BRAND', 'MODEL', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY']);
  const custom = createListingGenerationPlan(generationInput({ mutate(input) {
    input.merchantPreferences.listing.rules!.title.fieldOrder = ['MODEL', 'BRAND', 'PRODUCT_TYPE'];
  } }));
  assert.deepEqual(custom.titlePlan.componentOrder, ['MODEL', 'BRAND', 'PRODUCT_TYPE']);
});
test('SEO plan is metadata-only and preserves existing handles by default', () => {
  const plan = createListingGenerationPlan(generationInput()); const handle = plan.seoPlan.handlePlan as Record<string, unknown>; const meta = plan.seoPlan.metaDescriptionPlan as Record<string, unknown>;
  assert.equal(handle.lockedExistingHandle, 'acme-x1000'); assert.equal(handle.updateAllowed, false); assert.equal(meta.shippingPolicy, false); assert.equal(meta.availabilityPolicy, false); assert.deepEqual(plan.seoPlan.searchIntentPriorities.slice(0, 2), ['EXACT_MODEL', 'PRODUCT_DISCOVERY']); assert.equal('generatedText' in plan.seoPlan, false);
});
test('Publishing constraints exclude commerce/destructive work and keep proposals reviewable', () => {
  const plan = createListingGenerationPlan(generationInput({ findings: [...truthFindings(), finding('price', '999', 'VERIFIED'), finding('inventory', '20', 'VERIFIED')] })); assert.equal(plan.selectedFacts.some(({ fieldId }) => fieldId === 'price'), true); assert.equal(plan.selectedFacts.find(({ fieldId }) => fieldId === 'price')?.allowedUses.includes('INTERNAL_ONLY'), true); assert.equal(plan.prohibitedOutputs.includes('NO_PRICE_GENERATION'), true); assert.equal(plan.prohibitedOutputs.includes('NO_INVENTORY_GENERATION'), true); assert.equal(plan.mediaPlan.deletionPolicy, 'NEVER_DELETE'); assert.equal(plan.metafieldPlan.shopifyMutationAllowed, false);
});
test('AI, localization, media and review plans remain bounded and execution-free', () => {
  const plan = createListingGenerationPlan(generationInput()); assert.equal(plan.aiPolicy.factualStrictness, 'VERIFIED_ONLY'); assert.equal(plan.aiPolicy.aiExecutionRequested, false); assert.equal(plan.localizationPlan.primaryLanguage, 'en'); assert.equal(plan.localizationPlan.unitConversionPolicy, 'PRESERVE_VERIFIED_SOURCE'); assert.equal(plan.mediaPlan.imageGenerationAllowed, false); assert.equal(plan.mediaPlan.selectedImageReferences[0], 'image-1'); assert.equal(plan.reviewRequirements.some(({ type }) => type === 'PUBLISHING_REVIEW'), true);
});
test('metafield plan maps verified fields and blocks unresolved values without Shopify mutation', () => {
  const findings = truthFindings().map((value) => value.fieldPath === 'refresh_rate' ? finding('refresh_rate', '', 'UNRESOLVED') : value); const plan = createListingGenerationPlan(generationInput({ findings })); const verified = plan.metafieldPlan.entries.find(({ truthFieldId }) => truthFieldId === 'resolution'); const blocked = plan.metafieldPlan.entries.find(({ truthFieldId }) => truthFieldId === 'refresh_rate'); assert.ok(verified?.selectedFactId); assert.equal(blocked?.selectedFactId, null); assert.equal(blocked?.blockedReason, 'NO_SELECTED_VERIFIED_FACT'); assert.equal(plan.metafieldPlan.createDefinitions, false);
});
