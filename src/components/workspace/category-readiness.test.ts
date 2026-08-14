import assert from 'node:assert/strict';
import test from 'node:test';
import { applicableReadinessRows, isTelevisionProduct } from './category-readiness.ts';
import type { TruthRow } from '@/types/product';

function row(field: string, value: string, status: TruthRow['status'] = 'Verified'): TruthRow {
  return { field, value, status, source: 'QA fixture', sourcesCount: 1, confidence: 90 };
}

test('air-treatment products never receive television readiness requirements', () => {
  const rows = [
    row('Product type', 'Air purifier, humidifier and fan'),
    row('Filtration', 'HEPA H13'),
    row('Panel', 'Missing', 'Missing'),
    row('HDR', 'Missing', 'Missing'),
    row('Refresh rate', 'Missing', 'Missing'),
    row('Resolution', 'Missing', 'Missing'),
  ];

  assert.equal(isTelevisionProduct(rows), false);
  assert.deepEqual(applicableReadinessRows(rows).map(({ field }) => field), [
    'Product type',
    'Filtration',
  ]);
});

test('televisions retain television-specific readiness requirements', () => {
  const rows = [
    row('Product type', 'OLED television'),
    row('Panel', 'Missing', 'Missing'),
    row('Resolution', '4K'),
  ];

  assert.equal(isTelevisionProduct(rows), true);
  assert.equal(applicableReadinessRows(rows).length, rows.length);
});

test('generic products remain category-neutral', () => {
  const rows = [
    row('Brand', 'Example'),
    row('Model', 'A1'),
    row('Warranty', 'Missing', 'Missing'),
    row('HDR', 'Missing', 'Missing'),
  ];

  assert.deepEqual(applicableReadinessRows(rows).map(({ field }) => field), [
    'Brand',
    'Model',
    'Warranty',
  ]);
});
