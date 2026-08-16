import assert from 'node:assert/strict';
import test from 'node:test';
import { extractSourceImageCandidates, MAX_SOURCE_IMAGE_CANDIDATES } from './source-image-detection.ts';

const pageUrl = 'https://shop.example.com/products/dyson-airstrait-ht01';

test('retains the exact Product JSON-LD gallery and stops before page fallbacks', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01 Wet to Dry Straightener</title>
    <script type="application/ld+json">{"@type":"Product","name":"Dyson Airstrait HT01","model":"HT01","brand":{"name":"Dyson"},"image":["https://cdn.example.com/ht01-front.webp","https://cdn.example.com/ht01-side.webp"]}</script>
    <meta property="og:image" content="https://cdn.example.com/social.jpg">
    <div class="product-gallery"><img src="https://cdn.example.com/gallery-extra.jpg" width="1200" height="1200"></div>
    <img src="https://cdn.example.com/dyson-airstrait-ht01-editorial.jpg" width="1600" height="900" alt="Dyson Airstrait HT01 lifestyle">
  `, pageUrl);
  assert.deepEqual(images.map(({ url }) => url), [
    'https://cdn.example.com/ht01-front.webp',
    'https://cdn.example.com/ht01-side.webp',
  ]);
  assert.ok(images.every(({ sourceKind }) => sourceKind === 'JSON_LD'));
});

test('chooses the matching Product JSON-LD node instead of an unrelated same-brand Product', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01 Wet to Dry Straightener</title>
    <script type="application/ld+json">{"@graph":[
      {"@type":"Product","name":"Dyson V16 Vacuum","model":"V16","brand":"Dyson","image":["https://cdn.example.com/v16.jpg"]},
      {"@type":"Product","name":"Dyson Airstrait HT01","model":"HT01","brand":"Dyson","image":["https://cdn.example.com/ht01.jpg"]}
    ]}</script>
  `, pageUrl);
  assert.deepEqual(images.map(({ url }) => url), ['https://cdn.example.com/ht01.jpg']);
});

test('retains one exact Product gallery and rejects related carousel, recommendation and lifestyle media', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01 Wet to Dry Straightener</title>
    <main>
      <section class="product-gallery" aria-label="Dyson Airstrait HT01 product media">
        <img src="https://cdn.example.com/ht01-front.jpg" width="1400" height="1400" alt="Dyson Airstrait HT01 front">
        <picture><source srcset="https://cdn.example.com/ht01-side-400.webp 400w, https://cdn.example.com/ht01-side-1600.webp 1600w"></picture>
      </section>
      <section class="lifestyle-editorial"><img src="https://cdn.example.com/ht01-campaign.jpg" width="1800" height="900" alt="Dyson Airstrait HT01 lifestyle"></section>
      <section class="related-products product-carousel"><img src="https://cdn.example.com/dyson-v16.jpg" width="1200" height="1200" alt="Dyson V16"></section>
      <section class="recommendations"><img src="https://cdn.example.com/dyson-airwrap.jpg" width="1200" height="1200" alt="Dyson Airwrap"></section>
    </main>
  `, pageUrl);
  assert.deepEqual(images.map(({ url }) => url), [
    'https://cdn.example.com/ht01-front.jpg',
    'https://cdn.example.com/ht01-side-1600.webp',
  ]);
});

test('retains Open Graph only when structured Product media and an exact gallery are absent', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01</title>
    <meta property="og:image" content="https://cdn.example.com/ht01-social.jpg">
    <section class="recommendations"><img src="https://cdn.example.com/dyson-v16.jpg" width="1200" height="1200"></section>
  `, pageUrl);
  assert.deepEqual(images.map(({ sourceKind }) => sourceKind), ['OPEN_GRAPH']);
  assert.equal(images[0]?.url, 'https://cdn.example.com/ht01-social.jpg');
});

test('a single JSON-LD hero defers to the exact gallery but remains the fallback when no gallery exists', () => {
  const galleryImages = extractSourceImageCandidates(`
    <title>Dyson Supersonic HD04 Hair Dryer</title>
    <script type="application/ld+json">{"@type":"Product","name":"Dyson Supersonic HD04","image":"https://cdn.example.com/hd04-hero.jpg"}</script>
    <div class="productView-nav" data-image-gallery-main>
      <img src="https://cdn.example.com/hd04-front.jpg" width="1200" height="1200">
      <img src="https://cdn.example.com/hd04-side.jpg" width="1200" height="1200">
    </div>
  `, 'https://shop.example.com/products/dyson-supersonic-hd04');
  assert.deepEqual(galleryImages.map(({ url }) => url), [
    'https://cdn.example.com/hd04-front.jpg',
    'https://cdn.example.com/hd04-side.jpg',
  ]);

  const heroOnly = extractSourceImageCandidates(`
    <title>Dyson Supersonic HD04 Hair Dryer</title>
    <script type="application/ld+json">{"@type":"Product","name":"Dyson Supersonic HD04","image":"https://cdn.example.com/hd04-hero.jpg"}</script>
  `, 'https://shop.example.com/products/dyson-supersonic-hd04');
  assert.deepEqual(heroOnly.map(({ url }) => url), ['https://cdn.example.com/hd04-hero.jpg']);
  assert.equal(heroOnly[0]?.sourceKind, 'JSON_LD');
});

test('NEOVIX gallery data-main-image membership excludes thumbnails and nearby commerce imagery', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Supersonic HD04 Hair Dryer</title>
    <div class="productView-images" data-image-gallery>
      <div class="productView-nav" data-image-gallery-main data-media-count="2">
        <div><img src="https://cdn.example.com/hd04-front.jpg" width="2000" height="2000" data-main-image></div>
        <div><img src="https://cdn.example.com/hd04-side.jpg" width="2000" height="2000" data-main-image></div>
      </div>
      <div class="product-thumbnails">
        <img src="https://cdn.example.com/hd04-front_medium.jpg" width="400" height="400">
        <img src="https://cdn.example.com/hd04-side_medium.jpg" width="400" height="400">
      </div>
      <img src="https://cdn.example.com/payment-provider.png" width="1000" height="400" alt="Payment provider">
    </div>
  `, 'https://shop.example.com/products/dyson-supersonic-hd04');
  assert.deepEqual(images.map(({ url }) => url), [
    'https://cdn.example.com/hd04-front.jpg',
    'https://cdn.example.com/hd04-side.jpg',
  ]);
});

test('brand-only and generic category overlap are insufficient for fallback images', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01 Wet to Dry Straightener</title>
    <meta name="product:brand" content="Dyson">
    <img src="https://cdn.example.com/dyson-brand.jpg" width="1800" height="900" alt="Dyson">
    <img src="https://cdn.example.com/hair-straightener.jpg" width="1200" height="1200" alt="Dyson hair straightener">
    <img src="https://cdn.example.com/dyson-airstrait-ht01-front.jpg" width="1200" height="1200" alt="Dyson Airstrait HT01 front">
  `, pageUrl);
  assert.deepEqual(images.map(({ url }) => url), ['https://cdn.example.com/dyson-airstrait-ht01-front.jpg']);
});

test('does not harvest document-wide fallbacks after an exact gallery is found', () => {
  const images = extractSourceImageCandidates(`
    <title>Dyson Airstrait HT01</title>
    <div class="product-media-gallery"><img src="https://cdn.example.com/ht01-gallery.jpg" width="1200" height="1200"></div>
    <img src="https://cdn.example.com/dyson-airstrait-ht01-outside.jpg" width="1200" height="1200" alt="Dyson Airstrait HT01">
  `, pageUrl);
  assert.deepEqual(images.map(({ url }) => url), ['https://cdn.example.com/ht01-gallery.jpg']);
});

test('returns only a bounded authoritative set without padding', () => {
  const productImages = Array.from({ length: 30 }, (_, index) => `https://cdn.example.com/product-${index}.jpg`);
  const images = extractSourceImageCandidates(`
    <script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Item A100', image: productImages })}</script>
  `, 'https://shop.example.com/products/item-a100');
  assert.equal(images.length, MAX_SOURCE_IMAGE_CANDIDATES);
  assert.ok(images.every(({ sourceKind }) => sourceKind === 'JSON_LD'));
});

test('filters logos, pixels, local targets and unsupported schemes inside a gallery', () => {
  const images = extractSourceImageCandidates(`
    <div class="product-gallery">
      <img src="https://cdn.example.com/logo.png" width="1200" height="400">
      <img src="https://cdn.example.com/product.jpg" width="1" height="1">
      <img src="http://127.0.0.1/private.jpg" width="1200" height="1200">
      <img src="data:image/png;base64,abc" width="1200" height="1200">
      <img src="https://cdn.example.com/valid.jpg" width="1200" height="1200">
    </div>
  `, 'https://shop.example.com/item');
  assert.deepEqual(images.map(({ url }) => url), ['https://cdn.example.com/valid.jpg']);
});

test('deduplicates responsive variants while preserving strongest gallery provenance', () => {
  const images = extractSourceImageCandidates(`
    <div class="product-gallery">
      <img src="https://cdn.example.com/item.jpg?w=400" srcset="https://cdn.example.com/item.jpg?w=400 400w, https://cdn.example.com/item.jpg?w=1400 1400w" width="1000" height="1000">
      <img src="https://cdn.example.com/item.jpg?w=800" width="1000" height="1000">
    </div>
  `, 'https://shop.example.com/item');
  assert.equal(images.length, 1);
  assert.equal(images[0]?.sourceKind, 'GALLERY');
  assert.match(images[0]?.urlHash ?? '', /^[a-f0-9]{64}$/u);
});
