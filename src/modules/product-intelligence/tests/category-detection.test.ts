import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProductIntelligencePack } from '../domain/contracts.ts';
import { detectProductCategory } from '../detection/deterministic-category-detector.ts';
import { televisionIntelligencePack } from '../packs/television/television-pack.ts';
import { defaultProductIntelligenceRegistry } from '../registry/default-registry.ts';
import { createProductIntelligenceRegistry } from '../registry/product-intelligence-registry.ts';

const positiveTitles = [
  'Samsung 65 Inch QLED 4K Smart TV QN90F',
  'LG 43 Inch UHD Smart TV 43UA73',
  'Sony BRAVIA 98 Inch Full Array LED Google TV XR98X90L',
  'Samsung 85 Inch Neo QLED 8K Smart TV',
  'LG OLED evo 77 Inch Smart TV',
  'TCL 55 Inch Mini LED Google TV',
  'Hisense 65 Inch ULED VIDAA TV',
];
const accessories = [
  'Universal TV Wall Mount', 'Samsung TV Remote Control', 'TV Stand Cabinet',
  'HDMI Cable for Smart TV', 'Soundbar for OLED Television', 'Android TV Streaming Box',
  'TV Screen Protector', 'Replacement Power Board for LG TV', 'Indoor TV Antenna',
  'Camera Mount for Television',
];
const unknown = [
  'Dyson V15 Vacuum', 'Nike Running Shoes', 'Vitamin C Face Serum',
  'Luxury Leather Sofa', 'Gaming Console', 'Laptop', 'Refrigerator',
  'Coffee Machine', "Children's Book", 'Pet Food',
];

test('detects positive Television titles with deterministic evidence', () => {
  for (const title of positiveTitles) {
    const first = detectProductCategory({ title }, defaultProductIntelligenceRegistry);
    const repeated = detectProductCategory({ title }, defaultProductIntelligenceRegistry);
    assert.equal(first.status, 'MATCHED', title);
    assert.equal(first.category, 'TELEVISION');
    assert.equal(first.matchedPackId, 'television');
    assert.equal(first.detectorVersion, '1.0.0');
    assert.deepEqual(first, repeated);
    assert.equal(first.evidence[0]?.polarity, 'POSITIVE');
  }
});

test('exact product types and trusted categories are stronger evidence', () => {
  for (const productType of ['Television', 'Smart TV', 'OLED TV', 'QLED TV', 'LED TV', 'Mini LED TV']) {
    const result = detectProductCategory({ title: 'Model X', productType }, defaultProductIntelligenceRegistry);
    assert.equal(result.status, 'MATCHED');
    assert.equal(result.confidence, 'HIGH');
    assert.equal(result.evidence[0]?.source, 'productType');
  }
  const category = detectProductCategory({ normalizedCategory: 'TELEVISION' }, defaultProductIntelligenceRegistry);
  assert.equal(category.status, 'MATCHED');
  assert.equal(category.evidence[0]?.source, 'normalizedCategory');
});

test('strong accessory evidence blocks Television even when title mentions TV', () => {
  for (const title of accessories) {
    const result = detectProductCategory({ title }, defaultProductIntelligenceRegistry);
    assert.equal(result.status, 'UNKNOWN', title);
    assert.equal(result.category, 'UNKNOWN');
    assert.equal(result.matchedPackId, null);
    assert.equal(result.negativeEvidence.some(({ polarity }) => polarity === 'NEGATIVE'), true);
  }
});

test('unrelated products, empty input, brand, vendor, and model alone remain unknown', () => {
  for (const title of unknown) assert.equal(detectProductCategory({ title }, defaultProductIntelligenceRegistry).status, 'UNKNOWN', title);
  assert.equal(detectProductCategory({}, defaultProductIntelligenceRegistry).status, 'UNKNOWN');
  assert.equal(detectProductCategory({ brand: 'Samsung' }, defaultProductIntelligenceRegistry).status, 'UNKNOWN');
  assert.equal(detectProductCategory({ vendor: 'LG' }, defaultProductIntelligenceRegistry).status, 'UNKNOWN');
  assert.equal(detectProductCategory({ model: 'QN90F' }, defaultProductIntelligenceRegistry).status, 'UNKNOWN');
});

test('hybrid and signage products are ambiguous or unknown without category enforcement', () => {
  const hybrid = detectProductCategory({ title: 'Smart Display and TV Monitor' }, defaultProductIntelligenceRegistry);
  assert.equal(hybrid.status, 'AMBIGUOUS');
  assert.equal(hybrid.matchedPackId, null);
  assert.equal(hybrid.competingCandidates[0]?.packId, 'television');
  for (const title of ['Portable Monitor with TV Tuner', 'Commercial Signage Display', 'Interactive Display with Television Features']) {
    assert.ok(['AMBIGUOUS', 'UNKNOWN'].includes(detectProductCategory({ title }, defaultProductIntelligenceRegistry).status));
  }
});

test('normalizes case, punctuation and hyphenated aliases without unstable evidence order', () => {
  const result = detectProductCategory({ title: 'LG—55-INCH MINI-LED SMART-TV', productType: 'Smart TV' }, defaultProductIntelligenceRegistry);
  assert.equal(result.status, 'MATCHED');
  assert.equal(result.evidence[0]?.source, 'productType');
  assert.deepEqual([...result.evidence], [...result.evidence].sort((left, right) => right.weight - left.weight || left.ruleId.localeCompare(right.ruleId)));
});

test('similar strong registered candidates return an explainable ambiguous result', () => {
  const competing = structuredClone(televisionIntelligencePack) as ProductIntelligencePack;
  (competing as unknown as { identity: ProductIntelligencePack['identity'] }).identity = { ...competing.identity, id: 'test-display', categoryId: 'DISPLAY', displayName: 'Displays' };
  (competing as unknown as { category: ProductIntelligencePack['category'] }).category = { ...competing.category, id: 'DISPLAY', displayName: 'Displays' };
  const registry = createProductIntelligenceRegistry([televisionIntelligencePack, competing]);
  const result = detectProductCategory({ productType: 'Smart TV' }, registry);
  assert.equal(result.status, 'AMBIGUOUS');
  assert.equal(result.competingCandidates.length, 2);
});
