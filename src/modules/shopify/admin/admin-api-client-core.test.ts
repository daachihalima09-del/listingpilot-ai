import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyAdminApiClient,
} from './admin-api-client-core.ts';
import { ShopifyAdminApiError } from './errors.ts';

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });
}

test('builds a versioned authenticated Shopify Admin API request', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const client = createShopifyAdminApiClient({
    shopDomain: 'Example.MyShopify.com',
    apiVersion: '2026-07',
    accessToken: 'plaintext-token',
    fetchImplementation: async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return jsonResponse({ shop: { id: 1 } }, {
        headers: {
          'x-request-id': 'request-1',
          'x-shopify-shop-api-call-limit': '4/40',
        },
      });
    },
  });

  const result = await client.request({
    path: '/shop.json',
    query: { fields: 'id,name', limit: 1 },
  });
  const url = new URL(requestedUrl);
  assert.equal(
    url.origin + url.pathname,
    'https://example.myshopify.com/admin/api/2026-07/shop.json',
  );
  assert.equal(url.searchParams.get('fields'), 'id,name');
  assert.equal(url.searchParams.get('limit'), '1');
  assert.equal(
    new Headers(requestedInit?.headers).get('X-Shopify-Access-Token'),
    'plaintext-token',
  );
  assert.equal(result.requestId, 'request-1');
  assert.equal(result.apiCallLimit, '4/40');
});

test('retries safe GET requests for transient Shopify failures', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const client = createShopifyAdminApiClient({
    shopDomain: 'example.myshopify.com',
    apiVersion: '2026-07',
    accessToken: 'token',
    maximumRetries: 2,
    random: () => 0,
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetchImplementation: async () => {
      attempts += 1;
      return attempts < 3
        ? jsonResponse({ errors: 'unavailable' }, { status: 503 })
        : jsonResponse({ products: [] });
    },
  });

  await client.request({ path: '/products.json' });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [250, 500]);
});

test('honors capped Retry-After values for Shopify 429 responses', async () => {
  let attempts = 0;
  const delays: number[] = [];
  const client = createShopifyAdminApiClient({
    shopDomain: 'example.myshopify.com',
    apiVersion: '2026-07',
    accessToken: 'token',
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetchImplementation: async () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({}, {
            status: 429,
            headers: { 'retry-after': '20' },
          })
        : jsonResponse({ products: [] });
    },
  });

  await client.request({ path: '/products.json' });
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [5_000]);
});

test('does not retry non-idempotent requests', async () => {
  let attempts = 0;
  const client = createShopifyAdminApiClient({
    shopDomain: 'example.myshopify.com',
    apiVersion: '2026-07',
    accessToken: 'token',
    fetchImplementation: async () => {
      attempts += 1;
      return jsonResponse({}, { status: 503 });
    },
  });

  await assert.rejects(
    client.request({
      method: 'POST',
      path: '/products.json',
      body: { product: {} },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_ADMIN_UNAVAILABLE');
      assert.equal(error.retryable, true);
      return true;
    },
  );
  assert.equal(attempts, 1);
});

test('normalizes authorization and validation errors without raw responses', async () => {
  for (const [status, code] of [
    [401, 'SHOPIFY_ADMIN_UNAUTHORIZED'],
    [422, 'SHOPIFY_ADMIN_INVALID_REQUEST'],
  ] as const) {
    const client = createShopifyAdminApiClient({
      shopDomain: 'example.myshopify.com',
      apiVersion: '2026-07',
      accessToken: 'secret-token',
      fetchImplementation: async () => jsonResponse({
        errors: 'raw secret-token response',
      }, {
        status,
        headers: { 'x-request-id': 'safe-request-id' },
      }),
    });
    await assert.rejects(
      client.request({ path: '/products.json' }),
      (error: unknown) => {
        assert.ok(error instanceof ShopifyAdminApiError);
        assert.equal(error.code, code);
        assert.equal(error.requestId, 'safe-request-id');
        assert.equal(error.message.includes('secret-token'), false);
        return true;
      },
    );
  }
});

test('aborts timed-out requests and returns a safe timeout error', async () => {
  const client = createShopifyAdminApiClient({
    shopDomain: 'example.myshopify.com',
    apiVersion: '2026-07',
    accessToken: 'token',
    timeoutMs: 5,
    maximumRetries: 0,
    fetchImplementation: async (_input, init) => new Promise<Response>(
      (_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      },
    ),
  });

  await assert.rejects(
    client.request({ path: '/products.json' }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_ADMIN_TIMEOUT');
      return true;
    },
  );
});

test('rejects unsafe paths and invalid success payloads', async () => {
  const client = createShopifyAdminApiClient({
    shopDomain: 'example.myshopify.com',
    apiVersion: '2026-07',
    accessToken: 'token',
    fetchImplementation: async () => new Response('not-json', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(
    client.request({ path: 'https://evil.example/products.json' }),
    ShopifyAdminApiError,
  );
  await assert.rejects(
    client.request({ path: '/products.json' }),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyAdminApiError);
      assert.equal(error.code, 'SHOPIFY_ADMIN_INVALID_RESPONSE');
      return true;
    },
  );
});
