export interface VersionedProductIdentity {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly productId: string;
  readonly version: number;
}

export function productLookupIdentity(identity: VersionedProductIdentity) {
  return {
    workspaceId: identity.workspaceId,
    projectId: identity.projectId,
    productId: identity.productId,
  };
}
