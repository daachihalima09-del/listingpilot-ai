import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextFixture, productFixture } from '../testing/fixtures.ts';
import {
  detectiveDependencies,
  truthFindingFixture,
  truthReportFixture,
} from '../testing/ai-detective-fixtures.ts';
import {
  evaluateIdentityConflicts,
  evaluateListingConflicts,
} from './evaluation.ts';

test('map-based identity detection handles thousands of products with deterministic groups', () => {
  const base = productFixture();
  const products = Array.from({ length: 4_000 }, (_, index) => productFixture({
    id: `product-${index}`,
    variants: [{
      ...base.variants[0],
      id: `variant-${index}`,
      sku: `SKU-${Math.floor(index / 2)}`,
      barcode: `BARCODE-${index}`,
    }],
  }));
  const dependencies = detectiveDependencies({
    context: contextFixture({
      analysisScope: 'FULL_CATALOG',
      products,
    }),
    truthReport: truthReportFixture([], { productCount: products.length }),
  });
  const first = evaluateIdentityConflicts(dependencies);
  const second = evaluateIdentityConflicts(dependencies);
  assert.equal(first.length, 2_000);
  assert.deepEqual(first.map(({ id }) => id), second.map(({ id }) => id));
});

test('truth-to-listing comparison uses indexed product lookup for thousands of findings', () => {
  const products = Array.from({ length: 3_000 }, (_, index) => productFixture({
    id: `product-${index}`,
    title: `Listing ${index}`,
  }));
  const findings = products.map((product, index) => truthFindingFixture({
    id: `finding-${index}`,
    productId: product.id,
    claimGroupId: `group-${index}`,
    selectedValue: `Verified ${index}`,
    deterministicFingerprint: `truth-${index}`,
  }));
  const dependencies = detectiveDependencies({
    context: contextFixture({
      analysisScope: 'FULL_CATALOG',
      products,
    }),
    truthReport: truthReportFixture(findings, { productCount: products.length }),
  });
  const contradictions = evaluateListingConflicts(dependencies);
  assert.equal(contradictions.length, products.length);
  assert.equal(new Set(contradictions.map(({ productId }) => productId)).size, products.length);
});
