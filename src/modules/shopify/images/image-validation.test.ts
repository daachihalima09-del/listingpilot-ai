import assert from 'node:assert/strict';
import test from 'node:test';
import {
  imageConfigurationInputSchema,
  remoteImageInputSchema,
  uploadInitiationInputSchema,
  validateImageBytes,
  imageQuality,
} from './image-validation.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const png = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1,
]);

test('remote input is strict and accepts a URL string for server inspection', () => {
  assert.equal(remoteImageInputSchema.parse({
    url: 'https://images.example/product.png',
    altText: ' Product photo ',
  }).altText, 'Product photo');
  assert.throws(() => remoteImageInputSchema.parse({
    url: 'https://images.example/product.png',
    altText: null,
    shopifyMediaId: '123',
  }));
});

test('upload metadata enforces type, extension, size, filename, and alt text', () => {
  assert.doesNotThrow(() => uploadInitiationInputSchema.parse({
    filename: 'product.png',
    mimeType: 'image/png',
    byteSize: 1_024,
    altText: null,
  }));
  for (const invalid of [
    { filename: 'product.svg', mimeType: 'image/svg+xml', byteSize: 2 },
    { filename: 'product.jpg', mimeType: 'image/png', byteSize: 2 },
    { filename: '../product.png', mimeType: 'image/png', byteSize: 2 },
    { filename: 'product.png', mimeType: 'image/png', byteSize: 0 },
    { filename: 'product.png', mimeType: 'image/png', byteSize: 20_000_001 },
    { filename: 'product.png', mimeType: 'image/png', byteSize: 2, altText: 'bad\u0000' },
  ]) assert.throws(() => uploadInitiationInputSchema.parse(invalid));
});

test('server validates signatures and generates stable SHA-256 hashes', () => {
  const first = validateImageBytes({
    bytes: png,
    declaredMimeType: 'image/png',
    filename: 'image.png',
  });
  const second = validateImageBytes({
    bytes: png,
    declaredMimeType: 'image/png',
  });
  assert.equal(first.contentHash, second.contentHash);
  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
  assert.throws(() => validateImageBytes({
    bytes: png,
    declaredMimeType: 'image/jpeg',
  }));
  assert.throws(() => validateImageBytes({
    bytes: new Uint8Array(),
    declaredMimeType: 'image/png',
  }));
});

test('deterministic image metadata reports dimensions and honest quality states', () => {
  const dimensionedPng = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0x06, 0x40, 0, 0, 0x04, 0xb0,
  ]);
  const metadata = validateImageBytes({ bytes: dimensionedPng, declaredMimeType: 'image/png' });
  assert.deepEqual({ width: metadata.width, height: metadata.height }, { width: 1600, height: 1200 });
  assert.equal(imageQuality(metadata).status, 'GOOD');
  assert.equal(imageQuality({ width: 500, height: 500, byteSize: 100 }).status, 'LOW_RESOLUTION');
  assert.equal(imageQuality({ width: null, height: null, byteSize: 100 }).status, 'NEEDS_ATTENTION');
});

test('configuration enforces count, unique ordering, and one primary first', () => {
  const valid = {
    version: 1,
    images: [
      { localId: id(1), altText: null, position: 0, isPrimary: true, active: true },
      { localId: id(2), altText: null, position: 1, isPrimary: false, active: true },
    ],
  };
  assert.doesNotThrow(() => imageConfigurationInputSchema.parse(valid));
  assert.throws(() => imageConfigurationInputSchema.parse({
    ...valid,
    images: valid.images.map((image) => ({ ...image, isPrimary: true })),
  }));
  assert.throws(() => imageConfigurationInputSchema.parse({
    ...valid,
    images: valid.images.map((image) => ({ ...image, position: 1 })),
  }));
  assert.throws(() => imageConfigurationInputSchema.parse({
    ...valid,
    images: Array.from({ length: 21 }, (_, index) => ({
      localId: id(index + 1),
      altText: null,
      position: index,
      isPrimary: index === 0,
      active: true,
    })),
  }));
});
