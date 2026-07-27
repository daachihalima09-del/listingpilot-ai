import assert from 'node:assert/strict';
import test from 'node:test';
import { importShopifyProduct } from './import-service.ts';
import { detailedProductFixture } from './snapshot.test.ts';

const context = {
  actorUserId: 'user-1',
  organizationId: 'org-1',
  workspaceId: 'workspace-1',
  shopifyStoreId: 'store-1',
  shopDomain: 'example.myshopify.com',
  role: 'OWNER',
};

test('returns an existing imported project without calling Shopify', async () => {
  let requests = 0;
  const result = await importShopifyProduct({
    apiVersion: '2026-07',
    requester: {
      async request() {
        requests += 1;
        throw new Error('must not call');
      },
    },
    repository: {
      async findExisting() { return { projectId: 'project-1', archived: false }; },
      async create() { throw new Error('must not create'); },
    },
  }, context, { productId: detailedProductFixture.id });
  assert.equal(result.projectId, 'project-1');
  assert.equal(result.created, false);
  assert.equal(requests, 0);
});

test('imports through a read-only query and atomically returns the created project', async () => {
  let requestBody = '';
  let createCalls = 0;
  const result = await importShopifyProduct({
    apiVersion: '2026-07',
    requester: {
      async request(input) {
        requestBody = JSON.stringify(input.body);
        return {
          data: { data: { product: detailedProductFixture } },
          status: 200,
          requestId: null,
          apiCallLimit: null,
        };
      },
    },
    repository: {
      async findExisting() { return null; },
      async create(input) {
        createCalls += 1;
        assert.equal(input.snapshot.product.id, detailedProductFixture.id);
        return { projectId: 'project-1', archived: false };
      },
    },
  }, context, { productId: detailedProductFixture.id });
  assert.equal(result.created, true);
  assert.equal(createCalls, 1);
  assert.equal(/mutation/i.test(requestBody), false);
});

test('a uniqueness race returns the winning project and leaves no duplicate result', async () => {
  let checks = 0;
  const result = await importShopifyProduct({
    apiVersion: '2026-07',
    requester: {
      async request() {
        return {
          data: { data: { product: detailedProductFixture } },
          status: 200,
          requestId: null,
          apiCallLimit: null,
        };
      },
    },
    repository: {
      async findExisting() {
        checks += 1;
        return checks === 1 ? null : { projectId: 'winner', archived: false };
      },
      async create() { throw new Error('unique conflict'); },
    },
  }, context, { productId: detailedProductFixture.id });
  assert.equal(result.projectId, 'winner');
  assert.equal(result.created, false);
});

