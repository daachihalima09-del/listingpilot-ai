import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { ShopifyListingSource } from './shopify-description.ts';
import { assembleShopifyListing } from './shopify-description.ts';

const text = (value: string) => ({ value, factIds: ['verified-fact'] });

function source(): ShopifyListingSource {
  return {
    title: text('Dyson PH05 Purifier Humidify+Cool'),
    specifications: [
      { label: 'Finish', ...text('White / Gold') },
      { label: 'Brand', ...text('Dyson') },
      { label: 'Model', ...text('PH05 (Purifier Humidify+Cool PH2 De-NOx)') },
      { label: 'Type', ...text('Air Purifier Humidifier & Cooling Fan') },
      { label: 'Version (if applicable)', ...text('PH05 / PH2 De-NOx Series') },
    ],
    overview: text('First verified paragraph with <safe> text.\n\nSecond verified paragraph with controls & sensors.'),
    features: Array.from({ length: 10 }, (_, index) => text(`${index === 0 ? '\u2714 ' : ''}Verified feature ${index + 1}`)),
    seo: { title: text('Dyson PH05'), description: text('Verified SEO description') },
  };
}

test('assembler produces the exact Shopify description order without losing structured content', () => {
  const listing = assembleShopifyListing(source());
  assert.deepEqual(listing.productInformation.map(({ label }) => label), ['Model', 'Brand', 'Type', 'Finish', 'Version']);
  assert.equal(listing.descriptionParagraphs.length, 2);
  assert.equal(listing.features.length, 10);
  const positions = [
    '<strong>Model:</strong>',
    '<strong>Brand:</strong>',
    '<strong>Type:</strong>',
    'First verified paragraph',
    'Second verified paragraph',
    '<h3>Key Features:</h3>',
    '\u2714 Verified feature 10',
  ].map((value) => listing.descriptionHtml.indexOf(value));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
});

test('assembler escapes all draft values and introduces formatting rather than new product claims', () => {
  const listing = assembleShopifyListing(source());
  assert.match(listing.descriptionHtml, /&lt;safe&gt;/u);
  assert.match(listing.descriptionHtml, /controls &amp; sensors/u);
  assert.doesNotMatch(listing.descriptionHtml, /<safe>|<script|javascript:/iu);
  for (const value of ['Dyson', 'PH05', 'White / Gold', 'First verified paragraph', 'Verified feature 10']) {
    assert.match(listing.descriptionHtml, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  }
});

test('sparse evidence remains sparse and reload-equivalent input creates an identical preview', () => {
  const sparse = source();
  const first = assembleShopifyListing({ ...sparse, features: sparse.features.slice(0, 3) });
  const reloaded = assembleShopifyListing(JSON.parse(JSON.stringify({ ...sparse, features: sparse.features.slice(0, 3) })) as ShopifyListingSource);
  assert.equal(first.features.length, 3);
  assert.deepEqual(reloaded, first);
});

test('workspace preview, update comparison and creation publishing share the deterministic assembler', async () => {
  const [workspace, review, publishing, preview] = await Promise.all([
    readFile(new URL('../../../components/workspace/ListingWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../review/review-engine.ts', import.meta.url), 'utf8'),
    readFile(new URL('../safe-publishing/safe-publishing-service.server.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/ShopifyListingPreview.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /assembleShopifyListing\(listingDraft\)/u);
  assert.match(review, /assembleShopifyListing\(draft\)\.descriptionHtml/u);
  assert.match(publishing, /assembleShopifyListing\(draft\)/u);
  assert.match(preview, /listing\.descriptionHtml/u);
  assert.doesNotMatch(`${workspace}\n${review}\n${publishing}`, /OpenAI.*Shopify Preview/iu);
});
