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
      async findExisting() { return { projectId: 'project-1', archived: false, state: 'VALID_EXISTING_LINK' }; },
      async repairLegacy() { throw new Error('must not repair'); },
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
      async repairLegacy() { throw new Error('must not repair'); },
      async create(input) {
        createCalls += 1;
        assert.equal(input.snapshot.product.id, detailedProductFixture.id);
        return { projectId: 'project-1', archived: false, state: 'VALID_EXISTING_LINK' };
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
        return checks === 1 ? null : { projectId: 'winner', archived: false, state: 'VALID_EXISTING_LINK' };
      },
      async repairLegacy() { throw new Error('must not repair'); },
      async create() { throw new Error('unique conflict'); },
    },
  }, context, { productId: detailedProductFixture.id });
  assert.equal(result.projectId, 'winner');
  assert.equal(result.created, false);
});

test('repairs one proven legacy publication without creating a duplicate project', async () => {
  let creates = 0;
  let repairs = 0;
  const result = await importShopifyProduct({
    apiVersion: '2026-07',
    requester: { async request() { return { data: { data: { product: detailedProductFixture } }, status: 200, requestId: null, apiCallLimit: null }; } },
    repository: {
      async findExisting() { return { projectId: 'legacy-project', archived: false, state: 'LEGACY_RECOVERABLE_LINK' }; },
      async repairLegacy(input) {
        repairs += 1;
        assert.equal(input.snapshot.product.id, detailedProductFixture.id);
        return { projectId: 'legacy-project', archived: false, state: 'RECOVERABLE_LINK_REPAIRED' };
      },
      async create() { creates += 1; throw new Error('must not create'); },
    },
  }, context, { productId: detailedProductFixture.id });
  assert.equal(result.projectId, 'legacy-project');
  assert.equal(result.repaired, true);
  assert.equal(repairs, 1);
  assert.equal(creates, 0);
});

test('archived and inconsistent links do not fetch Shopify or create replacements', async () => {
  for (const state of ['ARCHIVED_EXISTING_PROJECT', 'INCONSISTENT_LINK_BLOCKED'] as const) {
    let requests = 0;
    let creates = 0;
    const operation = importShopifyProduct({
      requester: { async request() { requests += 1; throw new Error('must not fetch'); } },
      repository: {
        async findExisting() { return { projectId: 'existing', archived: state === 'ARCHIVED_EXISTING_PROJECT', state }; },
        async repairLegacy() { throw new Error('must not repair'); },
        async create() { creates += 1; throw new Error('must not create'); },
      },
    }, context, { productId: detailedProductFixture.id });
    if (state === 'INCONSISTENT_LINK_BLOCKED') await assert.rejects(operation, /cannot be safely verified/iu);
    else assert.equal((await operation).archived, true);
    assert.equal(requests, 0);
    assert.equal(creates, 0);
  }
});
