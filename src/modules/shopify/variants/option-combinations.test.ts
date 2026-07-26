import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findNextAvailableCombination,
} from './option-combinations.ts';

test('adds one visible combination at a time instead of an automatic product', () => {
  const options = [
    { name: 'Size', values: ['S', 'M'] },
    { name: 'Color', values: ['Blue', 'Black'] },
  ];
  assert.deepEqual(findNextAvailableCombination(options, []), [
    { name: 'Size', value: 'S' },
    { name: 'Color', value: 'Blue' },
  ]);
  assert.deepEqual(findNextAvailableCombination(options, [[
    { name: 'Size', value: 'S' },
    { name: 'Color', value: 'Blue' },
  ]]), [
    { name: 'Size', value: 'S' },
    { name: 'Color', value: 'Black' },
  ]);
});
