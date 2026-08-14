import assert from 'node:assert/strict';
import test from 'node:test';
import {
  neovixCraftRulePack,
  projectCraftPack,
  projectSafeSourceAuthority,
  validateDraftCraftCompliance,
} from '../index.ts';

const facts = [
  { factId: 'brand', fieldId: 'brand', value: 'Samsung', truthStatus: 'VERIFIED' },
  { factId: 'type', fieldId: 'product_type', value: 'Smart TV', truthStatus: 'VERIFIED' },
  { factId: 'size', fieldId: 'screen_size', value: '98 Inch', truthStatus: 'VERIFIED' },
  { factId: 'tech', fieldId: 'resolution', value: '4K UHD', truthStatus: 'VERIFIED' },
  { factId: 'model', fieldId: 'model', value: '98DU9000', truthStatus: 'VERIFIED' },
] as const;
const field = (value: string, factIds: readonly string[]) => ({ value, factIds });
const draft = {
  title: field('Samsung 98DU9000 Smart TV 98 Inch 4K UHD', facts.map(({ factId }) => factId)),
  overview: field('Samsung Smart TV features 4K UHD picture.\n\nThe 98 Inch design includes model 98DU9000.', facts.map(({ factId }) => factId)),
  specifications: [
    { label: 'Model', ...field('98DU9000', ['model']) },
    { label: 'Brand', ...field('Samsung', ['brand']) },
    { label: 'Type', ...field('Smart TV', ['type']) },
    { label: 'Capacity', ...field('98 Inch', ['size']) },
    { label: 'Key Technologies', ...field('4K UHD', ['tech']) },
  ],
  features: [field('4K UHD picture', ['tech']), field('98 Inch screen', ['size'])],
};

test('validates NEOVIX title order, specifications, overview and bounded meaningful features', () => {
  const result = validateDraftCraftCompliance({ draft, facts, craft: projectCraftPack(neovixCraftRulePack), productIntelligencePriorityFieldIds: ['resolution'] });
  assert.equal(result.status, 'PASS_WITH_WARNINGS');
  assert.equal(result.findings.some(({ code }) => code === 'TITLE_COMPONENT_ORDER'), false);
  assert.equal(result.findings.some(({ code }) => code === 'FEATURE_COUNT_OUTSIDE_TARGET'), true);
  assert.equal(result.findings.some(({ code }) => code === 'CATEGORY_PRIORITY_IGNORED'), false);
  assert.equal(Object.isFrozen(result), true);
});

test('accepts the NEOVIX 8–12 feature range without adding filler policy findings', () => {
  const features = [
    field('4K UHD resolution', ['tech']), field('98 Inch screen', ['size']),
    field('Samsung product identity', ['brand']), field('Smart TV controls', ['type']),
    field('98DU9000 model identity', ['model']), field('4K UHD technology', ['tech']),
    field('98 Inch size identity', ['size']), field('Smart TV product type', ['type']),
  ];
  const result = validateDraftCraftCompliance({ draft: { ...draft, features }, facts, craft: projectCraftPack(neovixCraftRulePack), productIntelligencePriorityFieldIds: ['resolution'] });
  assert.equal(result.findings.some(({ code }) => code === 'FEATURE_COUNT_OUTSIDE_TARGET'), false);
});

test('detects identity order, promotional wording, semantic duplicates and specification prose', () => {
  const result = validateDraftCraftCompliance({
    draft: {
      ...draft,
      title: field('98DU9000 Samsung Smart TV, Best 4K UHD', ['model', 'brand', 'type', 'tech']),
      overview: field('98DU9000 Samsung Smart TV, Best 4K UHD', ['model', 'brand', 'type', 'tech']),
      specifications: [{ label: 'Technology', ...field('4K UHD '.repeat(40), ['tech']) }, { label: 'Resolution', ...field('4K UHD '.repeat(40), ['tech']) }],
      features: [field('4K UHD picture', ['tech']), field('Ultra HD picture', ['tech'])],
    },
    facts,
    craft: projectCraftPack(neovixCraftRulePack),
  });
  const codes = result.findings.map(({ code }) => code);
  assert.equal(result.status, 'REVIEW_REQUIRED');
  for (const code of ['TITLE_COMPONENT_ORDER', 'PROHIBITED_MARKETING_LANGUAGE', 'SPECIFICATION_PROSE_TOO_LONG', 'SPECIFICATION_DUPLICATE_VALUE', 'OVERVIEW_REPEATS_TITLE']) assert.equal(codes.includes(code), true);
});

test('projects deterministic safe source labels without trusting raw claims', () => {
  assert.equal(projectSafeSourceAuthority('MANUFACTURER_STRUCTURED', 'VERIFIED').displayLabel, 'Official Technical Specification');
  assert.equal(projectSafeSourceAuthority('MANUFACTURER_PAGE', 'VERIFIED').displayLabel, 'Official Manufacturer');
  assert.equal(projectSafeSourceAuthority('MANUFACTURER_DOCUMENT', 'VERIFIED').displayLabel, 'Official Manual');
  assert.equal(projectSafeSourceAuthority('AUTHORITATIVE_DISTRIBUTOR', 'VERIFIED').displayLabel, 'Authorized Distributor');
  assert.equal(projectSafeSourceAuthority('RETAILER_STRUCTURED', 'LIKELY').displayLabel, 'Trusted Retailer');
  assert.equal(projectSafeSourceAuthority('MARKETPLACE_LISTING', 'LIKELY').authorityLevel, 'UNVERIFIED');
  assert.equal(projectSafeSourceAuthority('MERCHANT_OVERRIDE', 'CONFIRMED').displayLabel, 'Merchant-Provided');
  assert.equal(projectSafeSourceAuthority('SHOPIFY_IMPORT', 'CONFIRMED').displayLabel, 'Imported from Shopify');
  assert.equal(projectSafeSourceAuthority('PRODUCT_INTELLIGENCE', 'GUIDANCE').limitations.length, 1);
  assert.equal(projectSafeSourceAuthority('Official manufacturer according to listing text', 'VERIFIED').displayLabel, 'Unknown Source');
  assert.deepEqual(projectSafeSourceAuthority('MANUFACTURER_STRUCTURED', 'VERIFIED'), projectSafeSourceAuthority('MANUFACTURER_STRUCTURED', 'VERIFIED'));
});
