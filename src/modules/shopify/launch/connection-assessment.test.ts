import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessShopifyLaunchConnection,
  type ShopifyLaunchConnectionRecord,
} from './connection-assessment.ts';

function dependencies(record: ShopifyLaunchConnectionRecord | null, elsewhere = false) {
  return {
    store: {
      async findByWorkspaceId() { return record; },
      async isShopConnectedElsewhere() { return elsewhere; },
    },
    decryptToken(encrypted: string) {
      if (encrypted === 'invalid') throw new Error('invalid');
      return 'token';
    },
  };
}

const input = {
  workspaceId: 'workspace-1',
  shopDomain: 'example.myshopify.com',
  requiredScopes: ['write_products'],
};

test('assesses every safe local connection state without calling Shopify', async () => {
  const base: ShopifyLaunchConnectionRecord = {
    shopDomain: input.shopDomain,
    status: 'CONNECTED',
    accessTokenEncrypted: 'encrypted',
    grantedScopes: ['write_products'],
  };
  assert.equal(await assessShopifyLaunchConnection(dependencies(base), input), 'CONNECTED_AND_USABLE');
  assert.equal(await assessShopifyLaunchConnection(dependencies(null), input), 'TOKEN_MISSING');
  assert.equal(await assessShopifyLaunchConnection(dependencies(null, true), input), 'SHOP_MISMATCH');
  assert.equal(await assessShopifyLaunchConnection(dependencies({ ...base, shopDomain: 'other.myshopify.com' }), input), 'SHOP_MISMATCH');
  assert.equal(await assessShopifyLaunchConnection(dependencies({ ...base, grantedScopes: [] }), input), 'SCOPE_UPGRADE_REQUIRED');
  assert.equal(await assessShopifyLaunchConnection(dependencies({ ...base, status: 'DISCONNECTED' }), input), 'DISCONNECTED');
  assert.equal(await assessShopifyLaunchConnection(dependencies({ ...base, accessTokenEncrypted: 'invalid' }), input), 'INVALID_CONNECTION');
});

