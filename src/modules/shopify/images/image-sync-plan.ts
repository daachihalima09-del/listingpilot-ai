import type { RemoteProductMedia } from './graphql-image-repository.ts';

export interface LocalShopifyImage {
  id: string;
  contentHash: string;
  altText: string | null;
  position: number;
  isPrimary: boolean;
  active: boolean;
  status:
    | 'CONFIGURED'
    | 'UPLOADING'
    | 'PROCESSING'
    | 'READY'
    | 'FAILED'
    | 'MISSING_REMOTE'
    | 'INACTIVE';
  shopifyFileId: string | null;
  shopifyMediaId: string | null;
}

export function buildManagedMediaMoves(
  remoteOrder: string[],
  desiredManagedOrder: string[],
) {
  const managed = new Set(desiredManagedOrder);
  const existingManagedSlots = remoteOrder
    .map((id, index) => managed.has(id) ? index : -1)
    .filter((index) => index >= 0);
  if (existingManagedSlots.length !== desiredManagedOrder.length) return [];
  const target = [...remoteOrder];
  for (const [index, slot] of existingManagedSlots.entries()) {
    target[slot] = desiredManagedOrder[index];
  }
  const simulated = [...remoteOrder];
  const moves: Array<{ mediaId: string; newPosition: number }> = [];
  for (let index = 0; index < target.length; index += 1) {
    if (simulated[index] === target[index]) continue;
    const targetIndex = simulated.indexOf(target[index], index + 1);
    if (targetIndex < 0 || !managed.has(target[index])) continue;
    const [moved] = simulated.splice(targetIndex, 1);
    simulated.splice(index, 0, moved);
    moves.push({ mediaId: moved, newPosition: index });
  }
  return moves;
}

export function buildImageSynchronizationPlan(
  localImages: LocalShopifyImage[],
  remoteMedia: RemoteProductMedia[],
) {
  const active = localImages
    .filter(({ active: enabled }) => enabled)
    .sort((left, right) => left.position - right.position);
  const remoteImages = remoteMedia.filter(
    (media): media is RemoteProductMedia & { kind: 'IMAGE' } => (
      media.kind === 'IMAGE'
    ),
  );
  const remoteById = new Map(remoteImages.map((media) => [media.id, media]));
  const seenHashes = new Set<string>();
  const plan = {
    attach: [] as LocalShopifyImage[],
    metadataUpdate: [] as Array<{
      local: LocalShopifyImage;
      remote: RemoteProductMedia;
    }>,
    unchanged: [] as Array<{
      local: LocalShopifyImage;
      remote: RemoteProductMedia;
    }>,
    missingRemotely: [] as LocalShopifyImage[],
    invalidLinkage: [] as LocalShopifyImage[],
    duplicate: [] as LocalShopifyImage[],
    failed: [] as LocalShopifyImage[],
    pending: [] as LocalShopifyImage[],
    inactive: localImages.filter(({ active: enabled }) => !enabled),
    unmanagedRemote: [] as RemoteProductMedia[],
    reorder: [] as Array<{ mediaId: string; newPosition: number }>,
  };

  for (const image of active) {
    if (seenHashes.has(image.contentHash)) {
      plan.duplicate.push(image);
      continue;
    }
    seenHashes.add(image.contentHash);
    if (image.status === 'FAILED') {
      plan.failed.push(image);
      continue;
    }
    if (
      image.status === 'PROCESSING'
      || image.status === 'UPLOADING'
      || image.status === 'CONFIGURED'
    ) {
      plan.pending.push(image);
      continue;
    }
    if (!image.shopifyFileId) {
      plan.invalidLinkage.push(image);
      continue;
    }
    if (!image.shopifyMediaId) {
      plan.attach.push(image);
      continue;
    }
    const remote = remoteById.get(image.shopifyMediaId);
    if (!remote) {
      plan.missingRemotely.push(image);
      continue;
    }
    if (remote.id !== image.shopifyFileId) {
      plan.invalidLinkage.push(image);
      continue;
    }
    if ((remote.alt ?? null) !== image.altText) {
      plan.metadataUpdate.push({ local: image, remote });
    } else {
      plan.unchanged.push({ local: image, remote });
    }
  }

  const managedIds = new Set(active.flatMap(
    ({ shopifyMediaId }) => shopifyMediaId ? [shopifyMediaId] : [],
  ));
  plan.unmanagedRemote = remoteMedia.filter((media) => (
    media.kind === 'UNMANAGED' || !managedIds.has(media.id)
  ));
  const allManagedRemote = active.every(({ shopifyMediaId }) => (
    Boolean(shopifyMediaId && remoteById.has(shopifyMediaId))
  ));
  if (allManagedRemote) {
    plan.reorder = buildManagedMediaMoves(
      remoteMedia.map(({ id }) => id),
      active.map(({ shopifyMediaId }) => shopifyMediaId!),
    );
  }
  return plan;
}
