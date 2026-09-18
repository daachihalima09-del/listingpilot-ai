import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyConfig } from '../config.ts';
import { ShopifyCallbackError } from '../types/errors.ts';
import {
  exchangeShopifyAuthorizationCode,
  verifyShopifyShop,
} from './shopify-client.ts';

const config: ShopifyConfig = {
  apiKey: 'key',
  apiSecret: 'secret',
  appUrl: 'https://app.example',
  apiVersion: '2026-07',
  scopes: ['read_products'],
  tokenEncryptionKey: Buffer.alloc(32).toString('base64'),
};

function mockFetch(response: Response): typeof fetch {
  return async () => response;
}

test('exchanges an authorization code and parses granted scopes', async () => {
  const result = await exchangeShopifyAuthorizationCode(config, {
    shopDomain: 'example.myshopify.com',
    code: 'code',
  }, mockFetch(Response.json({
    access_token: 'token',
    scope: 'read_products, write_products,read_products',
  })));
  assert.deepEqual(result, {
    accessToken: 'token',
    grantedScopes: ['read_products', 'write_products'],
  });
});

test('rejects non-2xx and invalid token responses', async () => {
  await assert.rejects(
    exchangeShopifyAuthorizationCode(config, {
      shopDomain: 'example.myshopify.com',
      code: 'code',
    }, mockFetch(new Response('denied', { status: 401 }))),
    ShopifyCallbackError,
  );
  await assert.rejects(
    exchangeShopifyAuthorizationCode(config, {
      shopDomain: 'example.myshopify.com',
      code: 'code',
    }, mockFetch(Response.json({ access_token: '' }))),
    ShopifyCallbackError,
  );
});

test('verifies shop metadata with GraphQL and rejects domain mismatches', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const verified = await verifyShopifyShop(config, {
    shopDomain: 'example.myshopify.com',
    accessToken: 'token',
  }, async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return Response.json({
      data: {
        shop: {
          id: 'gid://shopify/Shop/123',
          name: 'Example',
          myshopifyDomain: 'example.myshopify.com',
        },
      },
    });
  });
  assert.deepEqual(verified, {
    name: 'Example',
    shopDomain: 'example.myshopify.com',
  });
  assert.equal(requestedUrl, 'https://example.myshopify.com/admin/api/2026-07/graphql.json');
  assert.equal(requestedInit?.method, 'POST');
  assert.match(String(requestedInit?.body), /ListingPilotVerifyShop/u);
  assert.equal(String(requestedInit?.body).includes('shop.json'), false);

  await assert.rejects(
    verifyShopifyShop(config, {
      shopDomain: 'example.myshopify.com',
      accessToken: 'token',
    }, mockFetch(Response.json({
      data: {
        shop: {
          id: 'gid://shopify/Shop/456',
          name: 'Other',
          myshopifyDomain: 'other.myshopify.com',
        },
      },
    }))),
    ShopifyCallbackError,
  );
});

test('fails safely for expired tokens and GraphQL errors', async () => {
  for (const response of [
    Response.json({ errors: [{ message: 'Access denied' }] }),
    Response.json({}, { status: 401 }),
  ]) {
    await assert.rejects(
      verifyShopifyShop(config, {
        shopDomain: 'example.myshopify.com',
        accessToken: 'token',
      }, mockFetch(response)),
      ShopifyCallbackError,
    );
  }
});
