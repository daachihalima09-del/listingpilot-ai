import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Evidence, NormalizedProduct } from '../domain/types.ts';
import { DeterministicHasher } from '../deterministic/services.ts';
import {
  truthContextFixture,
  truthEvidenceFixture,
  truthProductFixture,
} from '../testing/product-truth-fixtures.ts';
import { createProductTruthBundle } from './factory.ts';

function largeInput(size: number): {
  products: readonly NormalizedProduct[];
  evidence: readonly Evidence[];
} {
  const products = Array.from({ length: size }, (_, index) => truthProductFixture({
    id: `product-${index}`,
    title: `Product ${index}`,
    description: undefined,
    vendor: undefined,
    productType: undefined,
    status: undefined,
    seo: { evidenceIds: [] },
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
  }));
  const evidence = products.flatMap((product, index) => ['a', 'b'].map((suffix) => {
    const base = truthEvidenceFixture(`evidence-${index}-${suffix}`, product.title);
    return {
      ...base,
      providerId: `provider-${index}-${suffix}`,
      metadata: {
        ...base.metadata,
        productId: product.id,
        sourceIdentity: `source-${index}-${suffix}`,
      },
    };
  }));
  return { products, evidence };
}

test('map-based grouping and source deduplication handle thousands of claims and evidence records', () => {
  const { products, evidence } = largeInput(1_500);
  const bundle = createProductTruthBundle({ hasher: new DeterministicHasher() });
  const analysis = bundle.analyzer.analyze(truthContextFixture(evidence, {
    analysisScope: 'FULL_CATALOG',
    products,
  }));
  assert.equal(analysis.report.productCount, 1_500);
  assert.equal(analysis.report.claimCount >= 4_500, true);
  assert.equal(evidence.length, 3_000);
  assert.equal(analysis.report.findings.filter(({ fieldPath }) => fieldPath === 'title').length, 1_500);
  assert.equal(analysis.report.findings.filter(({ fieldPath, status }) => (
    fieldPath === 'title' && status === 'VERIFIED'
  )).length, 1_500);
});

test('large Product Truth analysis remains deterministic without global caches', () => {
  const { products, evidence } = largeInput(1_000);
  const context = truthContextFixture(evidence, {
    analysisScope: 'FULL_CATALOG',
    products,
  });
  const first = createProductTruthBundle({ hasher: new DeterministicHasher() }).analyzer.analyze(context);
  const second = createProductTruthBundle({ hasher: new DeterministicHasher() }).analyzer.analyze(context);
  assert.equal(first.report.deterministicFingerprint, second.report.deterministicFingerprint);
  assert.deepEqual(
    first.report.findings.map(({ deterministicFingerprint }) => deterministicFingerprint),
    second.report.findings.map(({ deterministicFingerprint }) => deterministicFingerprint),
  );
});
