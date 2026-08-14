import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { legacyProductIdFromGid } from './catalog-validation.ts';

test('canonical Shopify GID and legacy numeric identity must agree', () => {
  assert.equal(legacyProductIdFromGid('gid://shopify/Product/15953343775054'), '15953343775054');
  assert.throws(() => legacyProductIdFromGid('gid://shopify/Product/not-numeric'));
});

test('legacy repair is atomic, audited, identity-bound, and never creates a project or publication', () => {
  const source = readFileSync(new URL('../repositories/prisma-product-import-repository.ts', import.meta.url), 'utf8');
  const repair = source.slice(source.indexOf('async repairLegacy'), source.indexOf('async create(input)'));
  assert.match(repair, /\$transaction/);
  assert.match(repair, /TransactionIsolationLevel\.Serializable/);
  assert.match(repair, /shopify\.product_linkage_repaired/);
  assert.match(repair, /shopifyStoreId === input\.shopifyStoreId/);
  assert.match(repair, /publication\.workspaceId !== input\.workspaceId/);
  assert.match(repair, /publication\.shopifyProductId !== product\.legacyResourceId/);
  assert.match(repair, /competingProductLink/);
  assert.doesNotMatch(repair, /project\.create|shopifyProductPublication\.create/);
});

test('catalog UI distinguishes valid, recoverable, archived, and blocked linkage', () => {
  const catalog = readFileSync(new URL('../../../app/catalog/shopify/page.tsx', import.meta.url), 'utf8');
  const preview = readFileSync(new URL('../../../app/catalog/shopify/[productReference]/page.tsx', import.meta.url), 'utf8');
  for (const source of [catalog, preview]) {
    assert.match(source, /Open Project/);
    assert.match(source, /View Archived Project/);
    assert.match(source, /RECOVERABLE_LINK/);
    assert.match(source, /could not be safely verified/);
  }
  assert.match(catalog, /Verify & Open Project/);
});

test('safe publishing retains update-only linkage and no product-create fallback', () => {
  const safePublishing = readFileSync(new URL('../safe-publishing/safe-publishing-service.server.ts', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../review/review-service.server.ts', import.meta.url), 'utf8');
  assert.match(safePublishing, /mode === 'UPDATE_EXISTING'/);
  assert.match(safePublishing, /verifyLinkage/);
  assert.doesNotMatch(review, /productCreate|productVariantsBulkCreate/);
});
