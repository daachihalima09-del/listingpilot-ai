import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { ShopifyConfig } from '../config.ts';
import {
  shopifyCallbackErrorUrl,
  shopifyCallbackSuccessUrl,
} from './callback-redirect.ts';
import {
  completeShopifyOAuthCallback,
  type ShopifyCallbackDependencies,
} from './callback-service.ts';
import { buildShopifyHmacMessage } from './hmac.ts';
import { hashShopifyOAuthState } from './state.ts';
import { ShopifyCallbackError } from '../types/errors.ts';

const state = 's'.repeat(43);
const now = new Date('2026-07-25T12:00:00.000Z');
const config: ShopifyConfig = {
  apiKey: 'key',
  apiSecret: 'secret',
  appUrl: 'https://app.example',
  apiVersion: '2026-07',
  scopes: ['read_products'],
  tokenEncryptionKey: Buffer.alloc(32).toString('base64'),
};

function callbackUrl(): string {
  const parameters = new URLSearchParams({
    code: 'authorization-code',
    shop: 'example.myshopify.com',
    state,
    timestamp: String(Math.floor(now.getTime() / 1_000)),
  });
  parameters.set(
    'hmac',
    createHmac('sha256', config.apiSecret)
      .update(buildShopifyHmacMessage(parameters))
      .digest('hex'),
  );
  return `https://app.example/api/shopify/callback?${parameters}`;
}

function dependencies() {
  const events: string[] = [];
  let storedToken = 'encrypted-old-token';
  const value: ShopifyCallbackDependencies = {
    async findState() {
      return {
        id: 'state-1',
        stateHash: hashShopifyOAuthState(state),
        userId: 'user-1',
        workspaceId: 'workspace-1',
        shopDomain: 'example.myshopify.com',
        expiresAt: new Date(now.getTime() + 60_000),
        consumedAt: null,
      };
    },
    async consumeState() {
      events.push('state-consumed');
    },
    async findTenant() {
      return {
        organizationId: 'organization-1',
        workspaceId: 'workspace-1',
        role: 'OWNER',
      };
    },
    async exchangeCode() {
      events.push('code-exchanged');
      return { accessToken: 'plaintext-token', grantedScopes: ['read_products'] };
    },
    async verifyShop() {
      events.push('shop-verified');
      return { name: 'Example', shopDomain: 'example.myshopify.com' };
    },
    encryptToken() {
      events.push('token-encrypted');
      return 'encrypted-new-token';
    },
    async persistConnection(input) {
      events.push('connection-persisted');
      storedToken = input.accessTokenEncrypted;
    },
    async recordFailure() {
      events.push('failure-audited');
    },
  };
  return { value, events, getStoredToken: () => storedToken };
}

test('completes the verified callback in security order', async () => {
  const context = dependencies();
  const result = await completeShopifyOAuthCallback(context.value, config, {
    requestUrl: callbackUrl(),
    cookieState: state,
    actorUserId: 'user-1',
    now,
  });
  assert.equal(result.shopDomain, 'example.myshopify.com');
  assert.equal(result.workspaceId, 'workspace-1');
  assert.deepEqual(context.events, [
    'state-consumed',
    'code-exchanged',
    'shop-verified',
    'token-encrypted',
    'connection-persisted',
  ]);
});

test('failed reconnect verification preserves the existing token and audits safely', async () => {
  const context = dependencies();
  context.value.verifyShop = async () => {
    throw new ShopifyCallbackError('connection_failed', 'shop_mismatch');
  };
  await assert.rejects(
    completeShopifyOAuthCallback(context.value, config, {
      requestUrl: callbackUrl(),
      cookieState: state,
      actorUserId: 'user-1',
      now,
    }),
    ShopifyCallbackError,
  );
  assert.equal(context.getStoredToken(), 'encrypted-old-token');
  assert.deepEqual(context.events, [
    'state-consumed',
    'code-exchanged',
    'failure-audited',
  ]);
});

test('builds only server-controlled success and error redirects', () => {
  assert.equal(
    shopifyCallbackSuccessUrl(config.appUrl).toString(),
    'https://app.example/settings/shopify?status=connected',
  );
  assert.equal(
    shopifyCallbackErrorUrl(config.appUrl, 'invalid_state').toString(),
    'https://app.example/settings/shopify?error=invalid_state',
  );
});
