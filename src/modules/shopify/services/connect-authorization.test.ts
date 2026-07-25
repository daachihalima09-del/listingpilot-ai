import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyOwnerAuthorizationStore } from './connect-authorization.ts';
import { requireShopifyConnectionOwner } from './connect-authorization.ts';
import {
  ShopifyForbiddenError,
  ShopifyUnauthenticatedError,
} from '../types/errors.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';

function ownerStore(isOwner: boolean): ShopifyOwnerAuthorizationStore {
  return {
    async isWorkspaceOwner() {
      return isOwner;
    },
  };
}

test('rejects unauthenticated Shopify connection attempts', async () => {
  let authorizationChecked = false;
  const store: ShopifyOwnerAuthorizationStore = {
    async isWorkspaceOwner() {
      authorizationChecked = true;
      return true;
    },
  };

  await assert.rejects(
    requireShopifyConnectionOwner(store, null, workspaceId),
    ShopifyUnauthenticatedError,
  );
  assert.equal(authorizationChecked, false);
});

test('allows only workspace owners to start Shopify authorization', async () => {
  await assert.doesNotReject(
    requireShopifyConnectionOwner(ownerStore(true), userId, workspaceId),
  );
  await assert.rejects(
    requireShopifyConnectionOwner(ownerStore(false), userId, workspaceId),
    ShopifyForbiddenError,
  );
});
