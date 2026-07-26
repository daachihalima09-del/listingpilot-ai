import assert from 'node:assert/strict';
import test from 'node:test';
import { demoProduct } from '../../../data/demo-product.ts';
import {
  mapProjectToMetafields,
  metafieldValueHash,
} from './metafield-mapping.ts';

function project(overrides: Record<string, unknown> = {}) {
  const truthRows = [
    ...demoProduct.truthRows,
    { field: 'Capacity', value: '55 inch', source: 'https://private.example', sourcesCount: 2, confidence: 90, status: 'Verified' as const, reasoning: 'private chain' },
    { field: 'Technology', value: 'QLED, qled, HDR', source: 'private', sourcesCount: 2, confidence: 90, status: 'Verified' as const },
    { field: 'Finish', value: 'Unknown', source: 'private', sourcesCount: 0, confidence: 0, status: 'Missing' as const },
  ];
  return {
    projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    analysisData: {
      activeProduct: { ...demoProduct, truthRows },
      truthRows,
      analysisContext: null,
      conflictResolved: false,
    },
    generatedListing: {
      title: 'Samsung Q80D',
      description: 'Description',
      keyFeatures: '- Bright panel\n- HDR\n- bright panel',
    },
    seoData: {
      seoTitle: 'Samsung Q80D',
      seoDescription: 'SEO description',
      tags: 'TV, qled, tv',
    },
    ...overrides,
  };
}

function values(input = project()) {
  return new Map(mapProjectToMetafields(input).map(
    (field) => [field.catalogId, field.value],
  ));
}

test('maps existing project data into approved catalog fields', () => {
  const mapped = values();
  assert.equal(mapped.get('listingpilot_specs.model_number'), 'Q80D');
  assert.equal(mapped.get('listingpilot_specs.capacity'), '55 inch');
  assert.equal(mapped.get('listingpilot_specs.technology'), '["QLED","HDR"]');
  assert.equal(mapped.get('listingpilot_content.generated_tags'), '["TV","qled"]');
  assert.equal(mapped.get('listingpilot_truth.confidence_score'), '96');
});

test('omits missing optional and placeholder values', () => {
  const mapped = values(project({
    generatedListing: null,
    seoData: null,
  }));
  assert.equal(mapped.has('listingpilot_content.seo_title'), false);
  assert.equal(mapped.has('listingpilot_specs.finish'), false);
  assert.equal(mapped.has('listingpilot_truth.last_verified_at'), false);
  assert.equal(mapped.has('listingpilot_system.analyzed_at'), false);
});

test('preserves meaningful zero summary counts', () => {
  const input = project();
  const analysis = input.analysisData as {
    activeProduct: typeof demoProduct;
    truthRows: typeof demoProduct.truthRows;
  };
  analysis.activeProduct = {
    ...analysis.activeProduct,
    sources: [],
    catalogHealth: { ...analysis.activeProduct.catalogHealth, score: 0 },
  };
  analysis.truthRows = [];
  const mapped = values(input);
  assert.equal(mapped.get('listingpilot_truth.confidence_score'), '0');
  assert.equal(mapped.get('listingpilot_truth.source_count'), '0');
  assert.equal(mapped.get('listingpilot_truth.verified_field_count'), '0');
  assert.equal(mapped.get('listingpilot_truth.conflict_count'), '0');
});

test('Product Truth output contains summary only and excludes private evidence', () => {
  const output = JSON.stringify(mapProjectToMetafields(project()));
  assert.equal(output.includes('https://private.example'), false);
  assert.equal(output.includes('private chain'), false);
  assert.equal(output.includes('"source":'), false);
  assert.equal(output.includes('"reasoning":'), false);
});

test('mapping excludes unsupported project fields', () => {
  const output = JSON.stringify(mapProjectToMetafields(project({
    accessToken: 'secret-token',
    rawPrompt: 'private prompt',
    workspaceName: 'Private Workspace',
  })));
  assert.equal(output.includes('secret-token'), false);
  assert.equal(output.includes('private prompt'), false);
  assert.equal(output.includes('Private Workspace'), false);
});

test('value hashes and JSON mapping are stable', () => {
  const first = mapProjectToMetafields(project());
  const second = mapProjectToMetafields(project());
  assert.deepEqual(first, second);
  assert.equal(metafieldValueHash('same'), metafieldValueHash('same'));
  assert.notEqual(metafieldValueHash('same'), metafieldValueHash('changed'));
});
