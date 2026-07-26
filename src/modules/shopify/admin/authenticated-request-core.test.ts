import assert from 'node:assert/strict';
import test from 'node:test';
import {
  performAuthenticatedShopifyRequest,
  type ShopifyAdminCredentialStore,
} from './authenticated-request-core.ts';
import type {
  ShopifyAdminApiRequester,
} from './admin-api-client-core.ts';
import { ShopifyAdminApiError } from './errors.ts';

test('loads workspace credentials and decrypts the token only for the request', async () => {
  const operations: string[] = [];
  let requesterToken = '';
  const credentials: ShopifyAdminCredentialStore = {
    async findConnectedByWorkspaceId(workspaceId) {
      operations.push(`credentials:${workspaceId}`);
      return {
        shopDomain: 'example.myshopify.com',
        accessTokenEncrypted: 'encrypted-token',
      };
    },
  };
  const requester: ShopifyAdminApiRequester = {
    async request(input) {
      operations.push(`request:${input.path}`);
      return {
        data: { products: [] },
        status: 200,
        requestId: null,
        apiCallLimit: null,
      };
    },
  };

  const result = await performAuthenticatedShopifyRequest({
    credentials,
    decryptToken(encryptedToken) {
      operations.push(`decrypt:${encryptedToken}`);
      return 'plaintext-token';
    },
    createRequester({ shopDomain, accessToken }) {
      assert.equal(shopDomain, 'example.myshopify.com');
      requesterToken = accessToken;
      return requester;
    },
  }, {
    workspaceId: 'workspace-1',
    request: { path: '/products.json' },
  });

  assert.equal(requesterToken, 'plaintext-token');
  assert.deepEqual(operations, [
    'credentials:workspace-1',
    'decrypt:encrypted-token',
    'request:/products.json',
  ]);
  assert.equal(JSON.stringify(result).includes('plaintext-token'), false);
});

test('rejects missing or unusable connected credentials safely', async () => {
  const missing: ShopifyAdminCredentialStore = {
    async findConnectedByWorkspaceId() {
      return null;
    },
  };
  await assert.rejects(
    performAuthenticatedShopifyRequest({
      credentials: missing,
      decryptToken: () => 'token',
      createRequester: () => {
        throw new Error('must not create requester');
      },
    }, {
      workspaceId: 'workspace-1',
      request: { path: '/products.json' },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_STORE_NOT_CONNECTED');
      return true;
    },
  );

  const encrypted = 'sensitive-encrypted-payload';
  await assert.rejects(
    performAuthenticatedShopifyRequest({
      credentials: {
        async findConnectedByWorkspaceId() {
          return {
            shopDomain: 'example.myshopify.com',
            accessTokenEncrypted: encrypted,
          };
        },
      },
      decryptToken: () => {
        throw new Error('decryption failed');
      },
      createRequester: () => {
        throw new Error('must not create requester');
      },
    }, {
      workspaceId: 'workspace-1',
      request: { path: '/products.json' },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_ADMIN_UNAUTHORIZED');
      assert.equal(error.message.includes(encrypted), false);
      return true;
    },
  );
});
