export function isReviewStale(input: {
  status: 'OPEN' | 'STALE' | 'PUBLISHED';
  expiresAt: Date;
  projectVersion: number;
  currentProjectVersion: number;
  shopifyStoreId: string;
  currentShopifyStoreId: string;
  shopifyProductGid: string;
  currentShopifyProductGid: string;
  baselineSnapshotHash: string;
  currentBaselineSnapshotHash: string;
  remoteFingerprint: string;
  currentRemoteFingerprint?: string;
  now?: Date;
}): boolean {
  return (
    input.status !== 'OPEN'
    || input.expiresAt <= (input.now ?? new Date())
    || input.projectVersion !== input.currentProjectVersion
    || input.shopifyStoreId !== input.currentShopifyStoreId
    || input.shopifyProductGid !== input.currentShopifyProductGid
    || input.baselineSnapshotHash !== input.currentBaselineSnapshotHash
    || (
      input.currentRemoteFingerprint !== undefined
      && input.remoteFingerprint !== input.currentRemoteFingerprint
    )
  );
}

