import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopifyAdminApiError } from '../admin/errors.ts';
import { ShopifyProductPublishError } from './product-errors.ts';
import {
  updateShopifyProduct,
  type ShopifyProductUpdateAuditRepository,
} from './product-update-service.ts';
import type {
  ShopifyProductUpdateRepository,
} from './product-update-repository.ts';

const context = {
  actorUserId: 'user-1',
  organizationId: 'organization-1',
  workspaceId: 'workspace-1',
  role: 'OWNER',
};
const currentResponse = {
  product: {
    id: 987654321,
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    body_html: '<p>Original</p>',
    vendor: 'ListingPilot',
    product_type: 'Jackets',
    tags: 'Outdoor, Waterproof',
    status: 'draft',
    updated_at: '2026-07-26T12:00:00Z',
  },
};

function dependencies(options: {
  lookup?: unknown;
  updated?: unknown;
  lookupError?: unknown;
  updateError?: unknown;
} = {}) {
  const operations: string[] = [];
  const audits: unknown[] = [];
  const products: ShopifyProductUpdateRepository = {
    async findCurrent() {
      operations.push('lookup');
      if (options.lookupError) throw options.lookupError;
      return options.lookup ?? currentResponse;
    },
    async update(_workspaceId, _productId, payload) {
      operations.push(`update:${JSON.stringify(payload)}`);
      if (options.updateError) throw options.updateError;
      return options.updated ?? {
        product: {
          ...currentResponse.product,
          title: 'Alpine Shell',
          status: 'active',
          updated_at: '2026-07-26T12:05:00Z',
        },
      };
    },
  };
  const audit: ShopifyProductUpdateAuditRepository = {
    async recordUpdated(input) {
      operations.push('audit');
      audits.push(input);
    },
  };
  return { value: { products, audit }, operations, audits };
}

test('successfully updates changed fields and creates a safe audit event', async () => {
  const deps = dependencies();
  const result = await updateShopifyProduct(
    deps.value,
    context,
    '987654321',
    { title: 'Alpine Shell', status: 'ACTIVE' },
  );
  assert.deepEqual(result, {
    product: {
      id: '987654321',
      title: 'Alpine Shell',
      handle: 'alpine-jacket',
      status: 'ACTIVE',
      updatedAt: '2026-07-26T12:05:00Z',
    },
    changed: true,
    changedFields: ['title', 'status'],
  });
  assert.equal(deps.operations[0], 'lookup');
  assert.match(deps.operations[1] ?? '', /^update:/);
  assert.equal(deps.operations[2], 'audit');
  assert.deepEqual(
    (deps.audits[0] as { changedFields: string[] }).changedFields,
    ['title', 'status'],
  );
  const audit = JSON.stringify(deps.audits);
  assert.equal(audit.includes('body_html'), false);
  assert.equal(audit.includes('<p>Original</p>'), false);
});

test('no-change requests skip Shopify mutation and audit creation', async () => {
  const deps = dependencies();
  const result = await updateShopifyProduct(
    deps.value,
    context,
    '987654321',
    {
      title: 'Alpine Jacket',
      tags: ['waterproof', 'OUTDOOR'],
    },
  );
  assert.equal(result.changed, false);
  assert.deepEqual(result.changedFields, []);
  assert.deepEqual(deps.operations, ['lookup']);
  assert.deepEqual(deps.audits, []);
});

test('rejects non-owner updates before product lookup', async () => {
  const deps = dependencies();
  await assert.rejects(
    updateShopifyProduct(
      deps.value,
      { ...context, role: 'MEMBER' },
      '987654321',
      { title: 'No access' },
    ),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyProductPublishError);
      assert.equal(error.code, 'SHOPIFY_PRODUCT_FORBIDDEN');
      return true;
    },
  );
  assert.deepEqual(deps.operations, []);
});

test('maps lookup not-found, disconnected, validation, timeout, network, and rate-limit failures', async () => {
  const cases = [
    ['lookupError', 'SHOPIFY_ADMIN_NOT_FOUND', 'SHOPIFY_PRODUCT_NOT_FOUND'],
    ['lookupError', 'SHOPIFY_STORE_NOT_CONNECTED', 'SHOPIFY_PRODUCT_STORE_NOT_CONNECTED'],
    ['updateError', 'SHOPIFY_ADMIN_INVALID_REQUEST', 'SHOPIFY_PRODUCT_VALIDATION_FAILED'],
    ['updateError', 'SHOPIFY_ADMIN_TIMEOUT', 'SHOPIFY_PRODUCT_TIMEOUT'],
    ['updateError', 'SHOPIFY_ADMIN_UNAVAILABLE', 'SHOPIFY_PRODUCT_UNAVAILABLE'],
    ['updateError', 'SHOPIFY_ADMIN_RATE_LIMITED', 'SHOPIFY_PRODUCT_RATE_LIMITED'],
  ] as const;

  for (const [stage, sourceCode, expectedCode] of cases) {
    const source = new ShopifyAdminApiError({
      code: sourceCode,
      message: 'raw Shopify failure',
    });
    const deps = dependencies({ [stage]: source });
    await assert.rejects(
      updateShopifyProduct(
        deps.value,
        context,
        '987654321',
        { title: 'Alpine Shell' },
      ),
      (error: unknown) => {
        assert.ok(error instanceof ShopifyProductPublishError);
        assert.equal(error.code, expectedCode);
        assert.equal(error.message.includes('raw'), false);
        return true;
      },
    );
    assert.deepEqual(deps.audits, []);
  }
});

test('rejects malformed lookup and update responses safely', async () => {
  for (const options of [
    { lookup: { product: { id: 1 } } },
    { updated: { product: { id: 987654321, title: 'Incomplete' } } },
  ]) {
    const deps = dependencies(options);
    await assert.rejects(
      updateShopifyProduct(
        deps.value,
        context,
        '987654321',
        { title: 'Alpine Shell' },
      ),
      (error: unknown) => {
        assert.ok(error instanceof ShopifyProductPublishError);
        assert.equal(error.code, 'SHOPIFY_PRODUCT_INVALID_RESPONSE');
        return true;
      },
    );
    assert.deepEqual(deps.audits, []);
  }
});
