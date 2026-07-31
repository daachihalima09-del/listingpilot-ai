import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeterministicHasher } from '../deterministic/services.ts';
import { createProductTruthConfiguration } from './configuration.ts';
import {
  createDefaultProductTruthClaimExtractorRegistry,
  extractProductTruthClaims,
} from './extractors.ts';
import { groupProductTruthClaims } from './grouping.ts';
import {
  productClaimFixture,
  truthContextFixture,
  truthEvidenceFixture,
  truthProductFixture,
} from '../testing/product-truth-fixtures.ts';

function extract(context = truthContextFixture()) {
  const hasher = new DeterministicHasher();
  const configuration = createProductTruthConfiguration();
  return extractProductTruthClaims({
    context,
    registry: createDefaultProductTruthClaimExtractorRegistry({ configuration, hasher }),
  });
}

test('extracts generic title, brand, product-type, status, and SEO claims', () => {
  const result = extract(truthContextFixture([], {
    products: [truthProductFixture({
      title: 'Example title',
      vendor: 'Example brand',
      productType: 'Generic type',
      status: 'ACTIVE',
      seo: {
        title: 'SEO title',
        description: 'SEO description',
        handle: 'example',
        canonicalUrl: 'https://example.test/products/example',
        evidenceIds: [],
      },
    })],
  }));
  for (const identity of [
    'product.title',
    'product.vendor',
    'product.productType',
    'product.status',
    'seo.title',
    'seo.description',
    'seo.handle',
    'seo.canonicalUrl',
  ]) {
    assert.equal(result.claims.some(({ namespace, key }) => `${namespace}.${key}` === identity), true, identity);
  }
});

test('extracts specification claims without category-specific vocabulary', () => {
  const result = extract(truthContextFixture([], {
    products: [truthProductFixture({
      specifications: [{
        key: 'generic_measurement',
        label: 'Generic measurement',
        rawValue: '120',
        normalizedValue: '120',
        unit: 'u',
        valueType: 'DECIMAL',
        namespace: 'generic',
        evidenceIds: [],
      }],
    })],
  }));
  const claim = result.claims.find(({ key }) => key === 'generic_measurement');
  assert.equal(claim?.namespace, 'generic');
  assert.equal(claim?.unit, 'u');
  assert.equal(claim?.valueType, 'DECIMAL');
});

test('extracts variant identity, price, options, and generic attributes', () => {
  const result = extract(truthContextFixture([], {
    products: [truthProductFixture({
      variants: [{
        id: 'variant-1',
        sourceReferences: [],
        title: 'Blue',
        sku: 'SKU-1',
        barcode: '123',
        options: { Color: 'Blue' },
        price: '19.9900',
        compareAtPrice: '29.99',
        inventoryAttributes: {},
        measurementMetadata: {},
        attributes: { supplierCode: 'ABC' },
        evidenceIds: [],
      }],
    })],
  }));
  for (const key of ['title', 'sku', 'barcode', 'price', 'compareAtPrice']) {
    assert.equal(result.claims.some((claim) => claim.variantId === 'variant-1'
      && claim.namespace === 'variant' && claim.key === key), true, key);
  }
  assert.equal(result.claims.some(({ namespace, key }) => namespace === 'variant-option' && key === 'Color'), true);
  assert.equal(result.claims.some(({ namespace, key }) => (
    namespace === 'variant-attribute' && key === 'supplierCode'
  )), true);
});

test('extracts media metadata and generic product attributes', () => {
  const result = extract(truthContextFixture([], {
    products: [truthProductFixture({
      media: [{
        id: 'media-1',
        type: 'IMAGE',
        url: 'https://example.test/image.jpg',
        altText: 'Example',
        position: 0,
        width: 100,
        height: 200,
        evidenceIds: [],
      }],
      attributes: { metafield_like_value: 'Generic value' },
    })],
  }));
  assert.equal(result.claims.some(({ affectedFieldPath }) => affectedFieldPath === 'media.media-1.url'), true);
  assert.equal(result.claims.some(({ affectedFieldPath }) => (
    affectedFieldPath === 'attributes.metafield_like_value'
  )), true);
});

test('extracts structured supplied evidence as a separate traceable claim', () => {
  const evidence = truthEvidenceFixture('official', 'Evidence title');
  const result = extract(truthContextFixture([evidence]));
  const supplied = result.claims.find(({ metadata }) => metadata.suppliedEvidence === true);
  assert.equal(supplied?.normalizedCandidateValue, 'Evidence title');
  assert.deepEqual(supplied?.evidenceIds, ['official']);
  assert.equal(supplied?.origin, 'DOCUMENT_SUPPLIED');
});

test('ignores empty optional and unsupported evidence claims with warnings', () => {
  const evidence = truthEvidenceFixture('empty', undefined, {
    rawValue: undefined,
    normalizedValue: undefined,
  });
  const result = extract(truthContextFixture([evidence], {
    products: [truthProductFixture({
      description: undefined,
      vendor: undefined,
      productType: undefined,
      status: undefined,
      seo: { evidenceIds: [] },
    })],
  }));
  assert.equal(result.claims.some(({ affectedFieldPath }) => affectedFieldPath === 'description'), false);
  assert.equal(result.warnings.some((warning) => warning.includes('empty')), true);
});

test('claim IDs and output order are deterministic', () => {
  const context = truthContextFixture([
    truthEvidenceFixture('b', 'Example'),
    truthEvidenceFixture('a', 'Example'),
  ]);
  const first = extract(context);
  const second = extract(context);
  assert.deepEqual(first.claims.map(({ id }) => id), second.claims.map(({ id }) => id));
  assert.deepEqual(first.claims.map(({ id }) => id), [...first.claims.map(({ id }) => id)].sort());
});

test('claim extraction does not mutate and returns immutable records', () => {
  const context = truthContextFixture([truthEvidenceFixture('official', 'Example')]);
  const before = JSON.stringify(context);
  const result = extract(context);
  assert.equal(JSON.stringify(context), before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.claims[0]), true);
});

function grouped(claims = [productClaimFixture()]) {
  return groupProductTruthClaims({
    claims,
    configuration: createProductTruthConfiguration(),
    hasher: new DeterministicHasher(),
  });
}

test('equivalent claim identities and normalized values share one group and candidate', () => {
  const result = grouped([
    productClaimFixture({ id: 'one', normalizedCandidateValue: ' Example ' }),
    productClaimFixture({ id: 'two', normalizedCandidateValue: 'example' }),
  ]);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].claimIds.length, 2);
  assert.equal(result.groups[0].candidates.length, 1);
});

test('different products and variants remain separate claim groups', () => {
  const result = grouped([
    productClaimFixture({ id: 'p1', productId: 'p1' }),
    productClaimFixture({ id: 'p2', productId: 'p2' }),
    productClaimFixture({ id: 'v1', variantId: 'v1', affectedFieldPath: 'variants.v1.sku' }),
    productClaimFixture({ id: 'v2', variantId: 'v2', affectedFieldPath: 'variants.v2.sku' }),
  ]);
  assert.equal(result.groups.length, 4);
});

test('different namespaces remain separate even when display labels collide', () => {
  const result = grouped([
    productClaimFixture({ id: 'product', namespace: 'product', displayLabel: 'Same' }),
    productClaimFixture({ id: 'seo', namespace: 'seo', displayLabel: 'Same' }),
  ]);
  assert.equal(result.groups.length, 2);
});

test('group identity does not depend on display labels', () => {
  const first = grouped([productClaimFixture({ displayLabel: 'First label' })]);
  const second = grouped([productClaimFixture({ displayLabel: 'Second label' })]);
  assert.equal(first.groups[0].fingerprint, second.groups[0].fingerprint);
});

test('different candidate values are preserved in one semantic claim group', () => {
  const result = grouped([
    productClaimFixture({ id: 'one', normalizedCandidateValue: 'Alpha' }),
    productClaimFixture({ id: 'two', normalizedCandidateValue: 'Beta' }),
  ]);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].candidates.map(({ canonicalValue }) => canonicalValue), ['alpha', 'beta']);
});

test('supplied claim aliases provide a Knowledge Pack extension point for canonical identities', () => {
  const result = groupProductTruthClaims({
    claims: [
      productClaimFixture({
        id: 'alias-a',
        namespace: 'supplier',
        key: 'brand_name',
        affectedFieldPath: 'attributes.brand_name',
      }),
      productClaimFixture({
        id: 'alias-b',
        namespace: 'product',
        key: 'vendor',
        affectedFieldPath: 'vendor',
      }),
    ],
    configuration: createProductTruthConfiguration({
      claimAliases: {
        'supplier.brand_name': 'product.vendor',
      },
    }),
    hasher: new DeterministicHasher(),
  });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].namespace, 'product');
  assert.equal(result.groups[0].key, 'vendor');
});

test('malformed candidate values are isolated instead of destroying grouping', () => {
  const result = grouped([
    productClaimFixture({ id: 'valid', valueType: 'DECIMAL', normalizedCandidateValue: '10.00' }),
    productClaimFixture({ id: 'invalid', valueType: 'DECIMAL', normalizedCandidateValue: '10,00' }),
  ]);
  assert.deepEqual(result.ignoredClaimIds, ['invalid']);
  assert.equal(result.groups[0].candidates.length, 1);
  assert.equal(result.warnings.length, 1);
});

test('claim grouping preserves input objects and returns immutable output', () => {
  const claims = [productClaimFixture()];
  const before = JSON.stringify(claims);
  const result = grouped(claims);
  assert.equal(JSON.stringify(claims), before);
  assert.equal(Object.isFrozen(result.groups), true);
  assert.equal(Object.isFrozen(result.groups[0].candidates), true);
});
