import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewField, classifyThreeWay } from './three-way-comparison.ts';

test('classifies all supported three-way scalar states', () => {
  assert.equal(classifyThreeWay('a', 'a', 'a'), 'UNCHANGED');
  assert.equal(classifyThreeWay('a', 'b', 'a'), 'LOCAL_CHANGED');
  assert.equal(classifyThreeWay('a', 'a', 'b'), 'REMOTE_CHANGED');
  assert.equal(classifyThreeWay('a', 'b', 'b'), 'BOTH_CHANGED_SAME');
  assert.equal(classifyThreeWay('a', 'b', 'c'), 'CONFLICT');
  assert.equal(classifyThreeWay(undefined, 'a', undefined), 'LOCAL_ADDED');
  assert.equal(classifyThreeWay(undefined, undefined, 'a'), 'REMOTE_ADDED');
  assert.equal(classifyThreeWay('a', undefined, 'a'), 'LOCAL_REMOVED');
  assert.equal(classifyThreeWay('a', 'a', undefined), 'REMOTE_REMOVED');
  assert.equal(classifyThreeWay('a', undefined, undefined), 'BOTH_REMOVED');
});

test('assigns safe defaults server-side and requires explicit conflict decisions', () => {
  const local = buildReviewField({
    fieldPath: 'product.title',
    label: 'Title',
    resourceType: 'PRODUCT',
    baselineValue: 'A',
    localValue: 'B',
    remoteValue: 'A',
    publishable: true,
  });
  const remote = buildReviewField({
    ...local,
    localValue: 'A',
    remoteValue: 'B',
  });
  const conflict = buildReviewField({
    ...local,
    remoteValue: 'C',
  });
  assert.equal(local.defaultDecision, 'USE_LISTINGPILOT');
  assert.equal(remote.defaultDecision, 'KEEP_SHOPIFY');
  assert.equal(conflict.defaultDecision, null);
});

