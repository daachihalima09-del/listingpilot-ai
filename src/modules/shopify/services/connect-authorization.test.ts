import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ShopifyConnectTenantResolver,
  ShopifyOwnerAuthorizationStore,
} from './connect-authorization.ts';
import {
  requireShopifyConnectionOwner,
  resolveShopifyConnectTenant,
} from './connect-authorization.ts';
import {
  ShopifyForbiddenError,
  ShopifyUnauthenticatedError,
} from '../types/errors.ts';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';

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

function tenantResolver(input: {
  role?: 'OWNER' | 'ADMIN';
  organizationId?: string;
  workspaceId?: string;
} = {}): ShopifyConnectTenantResolver {
  return {
    async findForUser() {
      return {
        role: input.role ?? 'OWNER',
        organization: { id: input.organizationId ?? organizationId },
        workspace: {
          id: input.workspaceId ?? workspaceId,
          organizationId: input.organizationId ?? organizationId,
        },
      };
    },
  };
}

test('resolves an explicitly selected owner workspace without fallback', async () => {
  let receivedSelection: unknown;
  const resolver: ShopifyConnectTenantResolver = {
    async findForUser(_actorUserId, selection) {
      receivedSelection = selection;
      return tenantResolver().findForUser(userId, selection);
    },
  };
  const tenant = await resolveShopifyConnectTenant(resolver, userId, {
    organizationId,
    workspaceId,
  });
  assert.deepEqual(receivedSelection, { organizationId, workspaceId });
  assert.equal(tenant.workspace.id, workspaceId);
});

test('rejects unauthorized or mismatched explicit tenant selections', async () => {
  await assert.rejects(
    resolveShopifyConnectTenant(tenantResolver({ role: 'ADMIN' }), userId, {
      organizationId,
      workspaceId,
    }),
    ShopifyForbiddenError,
  );
  await assert.rejects(
    resolveShopifyConnectTenant(tenantResolver(), userId, {
      organizationId: '44444444-4444-4444-8444-444444444444',
      workspaceId,
    }),
    ShopifyForbiddenError,
  );
  await assert.rejects(
    resolveShopifyConnectTenant(tenantResolver(), userId, {
      organizationId,
      workspaceId: '55555555-5555-4555-8555-555555555555',
    }),
    ShopifyForbiddenError,
  );
});
