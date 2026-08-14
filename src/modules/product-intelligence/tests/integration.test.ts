import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DeterministicHasher } from '../../intelligence/deterministic/services.ts';
import { createProductTruthBundle } from '../../intelligence/product-truth/factory.ts';
import { contextFixture, productFixture } from '../../intelligence/testing/fixtures.ts';
import { getProductConflictGuidance, productConflictRequiresManualReview } from '../integration/conflict-guidance.ts';
import { analyzeProductIntelligence, resolvePersistedProductIntelligencePack } from '../integration/product-truth-intelligence.ts';
import { defaultProductIntelligenceRegistry } from '../registry/default-registry.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
function televisionProduct(title = 'Samsung 65 Inch QLED 4K Smart TV QN90F') {
  return productFixture({
    id: 'tv-1', title, productType: 'Smart TV', categories: ['Televisions'],
    attributes: { brand: 'Samsung', model: 'QN65QN90FAFXZA' },
    specifications: [
      { key: 'screen_size', label: 'Screen size', normalizedValue: 65, rawValue: '65 inch', valueType: 'DECIMAL', unit: 'in', evidenceIds: ['e-screen'] },
      { key: 'resolution', label: 'Resolution', normalizedValue: '4K_UHD', rawValue: '4K UHD', valueType: 'ENUM', evidenceIds: ['e-resolution'] },
      { key: 'display_technology', label: 'Display technology', normalizedValue: 'QLED', rawValue: 'QLED', valueType: 'ENUM', evidenceIds: ['e-display'] },
      { key: 'smart_platform', label: 'Smart platform', normalizedValue: 'Tizen', rawValue: 'Tizen', valueType: 'ENUM', evidenceIds: ['e-platform'] },
    ],
  });
}

test('Product Truth additively loads Television intelligence without overwriting values', () => {
  const product = televisionProduct();
  const context = contextFixture({ products: [product], capabilityPackIds: ['product-truth'] });
  const bundle = createProductTruthBundle({ hasher: new DeterministicHasher() });
  const first = bundle.analyzer.analyze(context);
  const repeated = bundle.analyzer.analyze(context);
  const intelligence = first.report.productIntelligence?.[0];
  assert.equal(intelligence?.categoryDetection.category, 'TELEVISION');
  assert.deepEqual(intelligence?.intelligencePack, { id: 'television', version: '1.0.0' });
  assert.deepEqual(intelligence?.categoryRequirements.missingIdentityFields, []);
  assert.deepEqual(first.report.productIntelligence, repeated.report.productIntelligence);
  assert.equal(context.products[0]?.specifications[0]?.normalizedValue, 65);
  assert.equal(context.products[0]?.specifications[0]?.evidenceIds[0], 'e-screen');
  const persisted = JSON.stringify(first.report.productIntelligence);
  assert.doesNotMatch(persisted, /truthFields|validationRules|detectionRules|neverInferRules/);
});

test('accessories, ambiguous products and unrelated categories keep generic Product Truth behavior', () => {
  const products = [
    productFixture({ id: 'accessory', title: 'Universal TV Wall Mount', productType: 'Accessory', categories: [] }),
    productFixture({ id: 'fashion', title: 'Nike Running Shoes', productType: 'Footwear', categories: ['Fashion'] }),
    productFixture({ id: 'beauty', title: 'Vitamin C Face Serum', productType: 'Serum', categories: ['Beauty'] }),
    productFixture({ id: 'furniture', title: 'Luxury Leather Sofa', productType: 'Sofa', categories: ['Furniture'] }),
    productFixture({ id: 'hybrid', title: 'Smart Display and TV Monitor', productType: 'Display', categories: [] }),
  ];
  for (const product of products) {
    const analysis = analyzeProductIntelligence(product, defaultProductIntelligenceRegistry);
    assert.equal(analysis.intelligencePack, null, product.id);
    assert.deepEqual(analysis.categoryRequirements.missingIdentityFields, []);
    assert.deepEqual(analysis.categoryValidationFindings, []);
  }
});

test('category-required findings become additive existing Product Truth issues', () => {
  const incomplete = { ...televisionProduct(), attributes: {}, specifications: [] };
  const context = contextFixture({ products: [incomplete], capabilityPackIds: ['product-truth'] });
  const analysis = createProductTruthBundle({ hasher: new DeterministicHasher() }).analyzer.analyze(context);
  const categoryIssues = analysis.issues.filter(({ code }) => code.startsWith('product-intelligence.'));
  assert.ok(categoryIssues.some(({ affectedFields }) => affectedFields.includes('brand')));
  assert.ok(categoryIssues.some(({ affectedFields }) => affectedFields.includes('resolution')));
  assert.ok(categoryIssues.every(({ category }) => category === 'PRODUCT_TRUTH'));
  assert.ok(categoryIssues.every(({ metadata }) => metadata.productIntelligencePackId === 'television'));
});

test('AI Detective conflict guidance is registry-driven and protects critical fields', () => {
  const model = getProductConflictGuidance({ category: 'TELEVISION', fieldId: 'model', registry: defaultProductIntelligenceRegistry });
  assert.equal(model?.packId, 'television');
  assert.equal(model?.packVersion, '1.0.0');
  assert.equal(model?.guidance.priority, 'CRITICAL');
  assert.equal(model?.guidance.autoResolutionAllowed, false);
  assert.equal(productConflictRequiresManualReview({ category: 'TELEVISION', fieldId: 'refresh_rate', registry: defaultProductIntelligenceRegistry }), true);
  assert.equal(getProductConflictGuidance({ category: 'UNKNOWN', fieldId: 'model', registry: defaultProductIntelligenceRegistry }), null);
  assert.equal(getProductConflictGuidance({ category: 'TELEVISION', fieldId: 'unknown', registry: defaultProductIntelligenceRegistry }), null);
  const detectiveCore = readFileSync(`${root}/src/modules/intelligence/ai-detective/evaluation.ts`, 'utf8');
  assert.doesNotMatch(detectiveCore, /TELEVISION|television|OLED|HDMI/);
});

test('Catalog Health reuses ordinary issues without a category-specific score', () => {
  const healthCore = readFileSync(`${root}/src/modules/intelligence/catalog-health/product-health.ts`, 'utf8');
  assert.doesNotMatch(healthCore, /TELEVISION|television|productIntelligencePackId/);
  const integration = readFileSync(`${root}/src/modules/product-intelligence/integration/product-truth-intelligence.ts`, 'utf8');
  assert.match(integration, /category: 'PRODUCT_TRUTH'/);
  assert.doesNotMatch(integration, /categoryHealthScore|televisionHealthScore/);
});

test('old or unsupported persisted pack references fail safely without rewriting history', () => {
  assert.equal(resolvePersistedProductIntelligencePack(undefined, defaultProductIntelligenceRegistry), null);
  assert.equal(resolvePersistedProductIntelligencePack({}, defaultProductIntelligenceRegistry), null);
  assert.equal(resolvePersistedProductIntelligencePack({ id: 'television', version: '0.9.0' }, defaultProductIntelligenceRegistry), null);
  assert.equal(resolvePersistedProductIntelligencePack({ id: 'missing', version: '1.0.0' }, defaultProductIntelligenceRegistry), null);
  assert.equal(resolvePersistedProductIntelligencePack({ id: 'television', version: '1.0.0' }, defaultProductIntelligenceRegistry)?.identity.id, 'television');
});
