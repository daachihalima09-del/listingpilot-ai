import {
  ShopifyForbiddenError,
  ShopifyUnauthenticatedError,
} from '../types/errors.ts';

export interface ShopifyOwnerAuthorizationStore {
  isWorkspaceOwner(userId: string, workspaceId: string): Promise<boolean>;
}

export async function requireShopifyConnectionOwner(
  store: ShopifyOwnerAuthorizationStore,
  actorUserId: string | null,
  workspaceId: string,
): Promise<void> {
  if (!actorUserId) {
    throw new ShopifyUnauthenticatedError();
  }

  if (!await store.isWorkspaceOwner(actorUserId, workspaceId)) {
    throw new ShopifyForbiddenError();
  }
}
