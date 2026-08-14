import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectProductCategory } from '../detection/deterministic-category-detector.ts';
import { televisionIntelligencePack } from '../packs/television/television-pack.ts';
import { defaultProductIntelligenceRegistry } from '../registry/default-registry.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));

test('reuses one registry and one pack across 10,000 deterministic mixed detections', () => {
  const fixtures = [
    'Samsung 65 Inch QLED 4K Smart TV QN90F',
    'LG OLED evo 77 Inch Smart TV',
    'Sony BRAVIA 98 Inch Google TV XR98X90L',
    'Universal TV Wall Mount',
    'Samsung Smart TV Replacement Remote',
    'Dyson V15 Detect Cordless Vacuum',
    'Nike Air Max Running Shoes',
    'Vitamin C Face Serum',
    'Luxury Leather Sofa',
    'Organic Coffee Beans',
  ];
  const firstPack = defaultProductIntelligenceRegistry.getById('television');
  const counts = { MATCHED: 0, AMBIGUOUS: 0, UNKNOWN: 0 };
  for (let index = 0; index < 10_000; index += 1) {
    const result = detectProductCategory({ title: fixtures[index % fixtures.length] }, defaultProductIntelligenceRegistry);
    counts[result.status] += 1;
  }
  assert.deepEqual(counts, { MATCHED: 3_000, AMBIGUOUS: 0, UNKNOWN: 7_000 });
  assert.equal(defaultProductIntelligenceRegistry, defaultProductIntelligenceRegistry);
  assert.equal(defaultProductIntelligenceRegistry.getById('television'), firstPack);
  assert.equal(firstPack, televisionIntelligencePack === firstPack ? televisionIntelligencePack : firstPack);
  assert.equal(defaultProductIntelligenceRegistry.size, 1);
});

test('hot-path framework has no network, database, dynamic code, or Shopify mutation dependency', () => {
  const files = [
    'detection/deterministic-category-detector.ts',
    'registry/product-intelligence-registry.ts',
    'integration/product-truth-intelligence.ts',
  ];
  const source = files.map((file) => readFileSync(`${root}/src/modules/product-intelligence/${file}`, 'utf8')).join('\n');
  assert.doesNotMatch(source, /\bfetch\s*\(|prisma|eval\s*\(|new Function|metafieldsSet|productCreate|productUpdate/i);
});
