import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createShopifyPublicationClient,
  friendlyShopifyPublicationError,
  safeShopifyAdminUrl,
  ShopifyPublicationClientError,
} from './shopify-publication-client.ts';

const product = {
  title: 'Alpine Jacket',
  descriptionHtml: '<p>Warm.</p>',
  vendor: 'Northwind',
  productType: '',
  tags: ['winter'],
  status: 'DRAFT' as const,
};

const successfulPayload = {
  outcome: 'CREATED',
  publication: {
    id: '123456789',
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    status: 'DRAFT',
    firstPublishedAt: '2026-07-26T12:00:00.000Z',
    lastPublishedAt: '2026-07-26T12:00:00.000Z',
  },
  changed: true,
  changedFields: [],
  adminUrl: 'https://sample-store.myshopify.com/admin/products/123456789',
};

test('first publish uses the project-scoped creation endpoint', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const client = createShopifyPublicationClient(async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return Response.json(successfulPayload, { status: 201 });
  });

  await client.publish({
    projectId: '11111111-1111-4111-8111-111111111111',
    mode: 'create',
    product,
  });
  assert.equal(
    capturedUrl,
    '/api/projects/11111111-1111-4111-8111-111111111111/shopify-publication',
  );
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(JSON.parse(String(capturedInit?.body)).product.id, undefined);
});

test('existing publications use PATCH without a browser-supplied product ID', async () => {
  let capturedUrl = '';
  let capturedMethod = '';
  const client = createShopifyPublicationClient(async (url, init) => {
    capturedUrl = String(url);
    capturedMethod = String(init?.method);
    return Response.json({
      ...successfulPayload,
      outcome: 'UNCHANGED',
      changed: false,
    });
  });
  await client.publish({
    projectId: '11111111-1111-4111-8111-111111111111',
    mode: 'update',
    product,
  });
  assert.equal(capturedMethod, 'PATCH');
  assert.equal(capturedUrl.includes('123456789'), false);
});

test('coalesces duplicate publish clicks into one request', async () => {
  let calls = 0;
  let resolveRequest: ((response: Response) => void) | undefined;
  const client = createShopifyPublicationClient(() => {
    calls += 1;
    return new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  });
  const input = {
    projectId: '11111111-1111-4111-8111-111111111111',
    mode: 'create' as const,
    product,
  };
  const first = client.publish(input);
  const second = client.publish(input);
  assert.equal(calls, 1);
  resolveRequest?.(Response.json(successfulPayload, { status: 201 }));
  assert.deepEqual(await first, await second);
});

test('maps validation, timeout, and rate-limit errors safely', () => {
  assert.match(
    friendlyShopifyPublicationError('SHOPIFY_PRODUCT_VALIDATION_FAILED'),
    /rejected the listing/i,
  );
  assert.match(
    friendlyShopifyPublicationError('SHOPIFY_PRODUCT_TIMEOUT'),
    /too long/i,
  );
  assert.match(
    friendlyShopifyPublicationError('SHOPIFY_PRODUCT_RATE_LIMITED'),
    /busy/i,
  );
});

test('rejects malformed success responses without rendering raw data', async () => {
  const client = createShopifyPublicationClient(async () => Response.json({
    token: 'secret',
    raw: { response: true },
  }));
  await assert.rejects(
    client.publish({
      projectId: '11111111-1111-4111-8111-111111111111',
      mode: 'create',
      product,
    }),
    (error) => (
      error instanceof ShopifyPublicationClientError
      && error.code === 'MALFORMED_RESPONSE'
      && !error.message.includes('secret')
    ),
  );
});

test('accepts only trusted Shopify Admin product links', () => {
  assert.equal(
    safeShopifyAdminUrl(
      'https://sample-store.myshopify.com/admin/products/123456789',
    ),
    'https://sample-store.myshopify.com/admin/products/123456789',
  );
  assert.equal(
    safeShopifyAdminUrl('https://evil.example/admin/products/123456789'),
    null,
  );
});
