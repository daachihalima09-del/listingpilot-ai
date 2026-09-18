import assert from 'node:assert/strict';
import test from 'node:test';
import { demoProduct } from '../../../data/demo-product.ts';
import {
  classifyCatalogCategory,
  verifiedRecommendationValues,
} from './metafield-recommendations.ts';
import { mapProjectToMetafields } from './metafield-mapping.ts';

function analysis(rows: Array<{ field: string; value: string; status: 'Verified' | 'Conflict' | 'Likely' | 'Missing' }>) {
  const truthRows = rows.map((row) => ({
    ...row,
    source: 'Merchant source',
    sourcesCount: 1,
    confidence: row.status === 'Verified' ? 95 : 60,
  }));
  return {
    activeProduct: { ...demoProduct, truthRows },
    truthRows,
    analysisContext: null,
    conflictResolved: false,
  };
}

test('television recommendations contain only verified category facts', () => {
  const data = analysis([
    { field: 'Product type', value: 'Television', status: 'Verified' },
    { field: 'Screen size', value: '65 inch', status: 'Verified' },
    { field: 'Resolution', value: '4K', status: 'Conflict' },
    { field: 'Refresh rate', value: '120 Hz', status: 'Likely' },
  ]);
  const result = verifiedRecommendationValues(null, data);
  assert.equal(result.category, 'TELEVISION');
  assert.equal(result.values.get('listingpilot_specs.screen_size'), '65 inch');
  assert.equal(result.values.has('listingpilot_specs.resolution'), false);
  assert.equal(result.values.has('listingpilot_specs.refresh_rate'), false);
});

test('category packs classify hair dryer, vacuum, air purifier, and generic products deterministically', () => {
  assert.equal(classifyCatalogCategory('Hair Dryer', null), 'HAIR_DRYER');
  assert.equal(classifyCatalogCategory('Cordless Vacuum Cleaner', null), 'VACUUM');
  assert.equal(classifyCatalogCategory('Air Purifier', null), 'AIR_PURIFIER');
  assert.equal(classifyCatalogCategory('Coffee maker', null), 'GENERIC');
});

test('unsupported and conflicting facts never become enabled recommendation values', () => {
  const result = verifiedRecommendationValues('Vacuum', analysis([
    { field: 'Suction power', value: '230 AW', status: 'Conflict' },
    { field: 'Battery runtime', value: '', status: 'Missing' },
  ]));
  assert.equal(result.values.size, 0);
});

for (const example of [
  ['Hair Dryer', 'Motor power', '1600 W', 'listingpilot_specs.motor_power'],
  ['Vacuum Cleaner', 'Battery runtime', '60 minutes', 'listingpilot_specs.battery_runtime'],
  ['Air Purifier', 'Coverage area', '800 sq ft', 'listingpilot_specs.coverage_area'],
] as const) {
  test(`${example[0]} maps its verified merchant attribute deterministically`, () => {
    const result = verifiedRecommendationValues(example[0], analysis([
      { field: example[1], value: example[2], status: 'Verified' },
    ]));
    assert.equal(result.values.get(example[3]), example[2]);
  });
}

test('generic verified facts remain structured while native Shopify fields are excluded', () => {
  const mapped = mapProjectToMetafields({
    projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    productType: 'Coffee maker',
    analysisData: analysis([
      { field: 'Title', value: 'Merchant title', status: 'Verified' },
      { field: 'Pressure', value: '15 bar', status: 'Verified' },
    ]),
    generatedListing: null,
    seoData: null,
  });
  const specifications = mapped.find(({ catalogId }) => catalogId === 'listingpilot_specs.specifications_json');
  assert.deepEqual(JSON.parse(specifications?.value ?? '{}'), { Pressure: '15 bar' });
  assert.equal(mapped.some(({ value }) => value.includes('Merchant title')), false);
});
