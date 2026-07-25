import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateShopifyOAuthState,
  hashShopifyOAuthState,
  shopifyOAuthStateCookieName,
  shopifyOAuthStateCookieOptions,
  verifyShopifyOAuthStateBinding,
} from './state.ts';
import { ShopifyCallbackError } from '../types/errors.ts';

test('generates unique cryptographically random OAuth state values', () => {
  const first = generateShopifyOAuthState();
  const second = generateShopifyOAuthState();

  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test('stores OAuth state in a short-lived protected cookie', () => {
  assert.equal(
    shopifyOAuthStateCookieName(true),
    '__Secure-listingpilot.shopify-oauth-state',
  );
  assert.deepEqual(shopifyOAuthStateCookieOptions(true), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/api/shopify',
    maxAge: 600,
  });
});

test('rejects expired and replayed OAuth state', () => {
  const queryState = generateShopifyOAuthState();
  const binding = {
    stateHash: hashShopifyOAuthState(queryState),
    userId: 'user-1',
    workspaceId: 'workspace-1',
    shopDomain: 'example.myshopify.com',
    expiresAt: new Date('2026-07-25T11:59:59.000Z'),
    consumedAt: null,
  };
  assert.throws(() => verifyShopifyOAuthStateBinding(binding, {
    queryState,
    cookieState: queryState,
    actorUserId: 'user-1',
    activeWorkspaceId: 'workspace-1',
    shopDomain: 'example.myshopify.com',
    now: new Date('2026-07-25T12:00:00.000Z'),
  }), ShopifyCallbackError);
  assert.throws(() => verifyShopifyOAuthStateBinding({
    ...binding,
    expiresAt: new Date('2026-07-25T12:10:00.000Z'),
    consumedAt: new Date(),
  }, {
    queryState,
    cookieState: queryState,
    actorUserId: 'user-1',
    activeWorkspaceId: 'workspace-1',
    shopDomain: 'example.myshopify.com',
  }), ShopifyCallbackError);
});

test('rejects OAuth state user, workspace, and shop mismatches', () => {
  const queryState = generateShopifyOAuthState();
  const binding = {
    stateHash: hashShopifyOAuthState(queryState),
    userId: 'user-1',
    workspaceId: 'workspace-1',
    shopDomain: 'example.myshopify.com',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  };
  for (const overrides of [
    { actorUserId: 'user-2' },
    { activeWorkspaceId: 'workspace-2' },
    { shopDomain: 'other.myshopify.com' },
  ]) {
    assert.throws(() => verifyShopifyOAuthStateBinding(binding, {
      queryState,
      cookieState: queryState,
      actorUserId: 'user-1',
      activeWorkspaceId: 'workspace-1',
      shopDomain: 'example.myshopify.com',
      ...overrides,
    }), ShopifyCallbackError);
  }
});
