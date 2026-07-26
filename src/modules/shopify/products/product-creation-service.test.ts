import assert from 'node:assert/strict';
import test from 'node:test';
import { ShopifyAdminApiError } from '../admin/errors.ts';
import {
  createShopifyProduct,
  type ShopifyProductAuditRepository,
} from './product-creation-service.ts';
import type {
  ShopifyProductCreationRepository,
} from './product-creation-repository.ts';
import { ShopifyProductPublishError } from './product-errors.ts';

const context = {
  actorUserId: 'user-1',
  organizationId: 'organization-1',
  workspaceId: 'workspace-1',
  role: 'OWNER',
};
const input = {
  title: 'Alpine Jacket',
  descriptionHtml: '<p>Weather-ready shell.</p>',
  vendor: 'ListingPilot',
  productType: 'Jackets',
  tags: ['outdoor'],
  status: 'DRAFT',
};

function dependencies(options: {
  response?: unknown;
  productError?: unknown;
} = {}) {
  const productWrites: unknown[] = [];
  const audits: unknown[] = [];
  const products: ShopifyProductCreationRepository = {
    async create(workspaceId, payload) {
      productWrites.push({ workspaceId, payload });
      if (options.productError) throw options.productError;
      return options.response ?? {
        product: {
          id: 987654321,
          title: 'Alpine Jacket',
          handle: 'alpine-jacket',
          status: 'draft',
        },
      };
    },
  };
  const audit: ShopifyProductAuditRepository = {
    async recordCreated(value) {
      audits.push(value);
    },
  };
  return { value: { products, audit }, productWrites, audits };
}

test('successfully publishes a valid product and records the safe audit event', async () => {
  const deps = dependencies();
  const product = await createShopifyProduct(deps.value, context, input);
  assert.deepEqual(product, {
    id: '987654321',
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    status: 'DRAFT',
  });
  assert.equal(deps.productWrites.length, 1);
  assert.deepEqual(deps.audits, [{
    actorUserId: 'user-1',
    organizationId: 'organization-1',
    workspaceId: 'workspace-1',
    product,
  }]);
  const serializedAudit = JSON.stringify(deps.audits);
  assert.equal(serializedAudit.includes('descriptionHtml'), false);
  assert.equal(serializedAudit.includes('Weather-ready'), false);
});

test('rejects invalid input and non-owner requests before Shopify calls', async () => {
  const invalid = dependencies();
  await assert.rejects(
    createShopifyProduct(invalid.value, context, {
      ...input,
      title: '',
    }),
  );
  assert.deepEqual(invalid.productWrites, []);

  const unauthorized = dependencies();
  await assert.rejects(
    createShopifyProduct(unauthorized.value, {
      ...context,
      role: 'MEMBER',
    }, input),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyProductPublishError);
      assert.equal(error.code, 'SHOPIFY_PRODUCT_FORBIDDEN');
      return true;
    },
  );
  assert.deepEqual(unauthorized.productWrites, []);
});

test('maps Shopify validation, network, timeout, and disconnected errors safely', async () => {
  const cases = [
    {
      source: new ShopifyAdminApiError({
        code: 'SHOPIFY_ADMIN_INVALID_REQUEST',
        message: 'raw validation',
        statusCode: 422,
      }),
      expected: 'SHOPIFY_PRODUCT_VALIDATION_FAILED',
    },
    {
      source: new Error('network details'),
      expected: 'SHOPIFY_PRODUCT_UNAVAILABLE',
    },
    {
      source: new ShopifyAdminApiError({
        code: 'SHOPIFY_ADMIN_TIMEOUT',
        message: 'raw timeout',
      }),
      expected: 'SHOPIFY_PRODUCT_TIMEOUT',
    },
    {
      source: new ShopifyAdminApiError({
        code: 'SHOPIFY_STORE_NOT_CONNECTED',
        message: 'raw database state',
      }),
      expected: 'SHOPIFY_PRODUCT_STORE_NOT_CONNECTED',
    },
  ] as const;

  for (const testCase of cases) {
    const deps = dependencies({ productError: testCase.source });
    await assert.rejects(
      createShopifyProduct(deps.value, context, input),
      (error: unknown) => {
        assert.ok(error instanceof ShopifyProductPublishError);
        assert.equal(error.code, testCase.expected);
        assert.equal(error.message.includes('raw'), false);
        return true;
      },
    );
    assert.deepEqual(deps.audits, []);
  }
});

test('rejects malformed Shopify responses without creating an audit event', async () => {
  const deps = dependencies({
    response: {
      product: {
        id: 1,
        title: 'Incomplete product',
      },
    },
  });
  await assert.rejects(
    createShopifyProduct(deps.value, context, input),
    (error: unknown) => {
      assert.ok(error instanceof ShopifyProductPublishError);
      assert.equal(error.code, 'SHOPIFY_PRODUCT_INVALID_RESPONSE');
      return true;
    },
  );
  assert.deepEqual(deps.audits, []);
});
