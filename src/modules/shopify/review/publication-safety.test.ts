import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const serviceSource = readFileSync(
  new URL('./review-service.server.ts', import.meta.url),
  'utf8',
);

test('selective review publishing has no product or variant creation fallback', () => {
  assert.doesNotMatch(serviceSource, /\bproductCreate\b/);
  assert.doesNotMatch(serviceSource, /\bproductVariantsBulkCreate\b/);
  assert.match(serviceSource, /productUpdate/);
  assert.match(serviceSource, /productVariantsBulkUpdate/);
});

test('successful publish refreshes Shopify before advancing the import baseline', () => {
  const refresh = serviceSource.indexOf('const refreshed = await fetchRemote()');
  const baselineUpdate = serviceSource.indexOf('shopifyProductImportLink.update');
  const consumed = serviceSource.indexOf("status: 'PUBLISHED'");

  assert.ok(refresh >= 0);
  assert.ok(baselineUpdate > refresh);
  assert.ok(consumed > baselineUpdate);
  assert.match(serviceSource, /sourceSnapshot: refreshed/);
});
