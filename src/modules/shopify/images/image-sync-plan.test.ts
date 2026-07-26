import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImageSynchronizationPlan,
  buildManagedMediaMoves,
  type LocalShopifyImage,
} from './image-sync-plan.ts';
import type { RemoteProductMedia } from './graphql-image-repository.ts';

function local(overrides: Partial<LocalShopifyImage> = {}): LocalShopifyImage {
  return {
    id: 'local-1',
    contentHash: 'a'.repeat(64),
    altText: 'Front',
    position: 0,
    isPrimary: true,
    active: true,
    status: 'READY',
    shopifyFileId: '101',
    shopifyMediaId: null,
    ...overrides,
  };
}

function remote(id: string, overrides: Partial<RemoteProductMedia> = {}): RemoteProductMedia {
  return {
    id,
    kind: 'IMAGE',
    alt: 'Front',
    status: 'READY',
    fileStatus: 'READY',
    imageUrl: 'https://cdn.shopify.com/image.png',
    ...overrides,
  };
}

test('planner classifies attach, metadata, unchanged, missing, invalid, duplicate and pending', () => {
  const images = [
    local(),
    local({ id: 'local-2', contentHash: 'b'.repeat(64), position: 1, shopifyFileId: '102', shopifyMediaId: '102', altText: 'New' }),
    local({ id: 'local-3', contentHash: 'c'.repeat(64), position: 2, shopifyFileId: '103', shopifyMediaId: '103' }),
    local({ id: 'local-4', contentHash: 'd'.repeat(64), position: 3, shopifyFileId: '104', shopifyMediaId: '104' }),
    local({ id: 'local-5', contentHash: 'e'.repeat(64), position: 4, status: 'PROCESSING' }),
    local({ id: 'local-6', contentHash: 'a'.repeat(64), position: 5 }),
  ];
  const plan = buildImageSynchronizationPlan(images, [
    remote('102', { alt: 'Old' }),
    remote('103'),
    remote('999'),
    remote('video', { kind: 'UNMANAGED' }),
  ]);
  assert.equal(plan.attach.length, 1);
  assert.equal(plan.metadataUpdate.length, 1);
  assert.equal(plan.unchanged.length, 1);
  assert.equal(plan.missingRemotely.length, 1);
  assert.equal(plan.pending.length, 1);
  assert.equal(plan.duplicate.length, 1);
  assert.deepEqual(plan.unmanagedRemote.map(({ id }) => id), ['999', 'video']);
});

test('managed ordering changes only managed slots and preserves unmanaged order', () => {
  assert.deepEqual(
    buildManagedMediaMoves(['merchant-a', '1', 'merchant-b', '2'], ['2', '1']),
    [{ mediaId: '2', newPosition: 1 }],
  );
  assert.deepEqual(
    buildManagedMediaMoves(['merchant-a', '1'], ['1', '2']),
    [],
  );
});
