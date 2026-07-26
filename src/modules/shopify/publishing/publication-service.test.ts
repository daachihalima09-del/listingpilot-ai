import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ShopifyPublicationError,
} from './publication-errors.ts';
import type {
  ShopifyPublicationProjectContext,
  ShopifyProductPublicationRepository,
} from './publication-repository.ts';
import {
  publishShopifyProject,
} from './publication-service.ts';

const context: ShopifyPublicationProjectContext = {
  actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  role: 'OWNER',
  publication: null,
};

const input = {
  product: {
    title: 'Alpine Jacket',
    descriptionHtml: '<p>Warm.</p>',
    vendor: 'Northwind',
    productType: '',
    tags: ['winter'],
    status: 'DRAFT',
  },
};

function reference(status: 'ACTIVE' | 'DRAFT' = 'DRAFT') {
  return {
    id: '123456789',
    title: 'Alpine Jacket',
    handle: 'alpine-jacket',
    status,
    firstPublishedAt: '2026-07-26T12:00:00.000Z',
    lastPublishedAt: '2026-07-26T12:00:00.000Z',
  };
}

function dependencies(options: {
  saveFails?: boolean;
  currentTitle?: string;
} = {}) {
  let creates = 0;
  let updates = 0;
  let saves = 0;
  const publications: ShopifyProductPublicationRepository = {
    async resolveProject() {
      return context;
    },
    async findForProject() {
      return null;
    },
    async save() {
      saves += 1;
      if (options.saveFails) throw new Error('database unavailable');
      return reference();
    },
    async saveCreated() {
      saves += 1;
      if (options.saveFails) throw new Error('database unavailable');
      return reference();
    },
  };
  return {
    dependencies: {
      publications,
      products: {
        async create() {
          creates += 1;
          return {
            product: {
              id: 123456789,
              title: 'Alpine Jacket',
              handle: 'alpine-jacket',
              status: 'draft',
            },
          };
        },
        async findCurrent() {
          return {
            product: {
              id: 123456789,
              title: options.currentTitle ?? 'Alpine Jacket',
              handle: 'alpine-jacket',
              body_html: '<p>Warm.</p>',
              vendor: 'Northwind',
              product_type: '',
              tags: 'winter',
              status: 'draft',
              updated_at: '2026-07-26T12:00:00.000Z',
            },
          };
        },
        async update() {
          updates += 1;
          return {
            product: {
              id: 123456789,
              title: 'Alpine Jacket',
              handle: 'alpine-jacket',
              body_html: '<p>Warm.</p>',
              vendor: 'Northwind',
              product_type: '',
              tags: 'winter',
              status: 'draft',
              updated_at: '2026-07-26T12:01:00.000Z',
            },
          };
        },
      },
      updateAudit: { async recordUpdated() {} },
      createRecoveryReceipt() {
        return 'encrypted-recovery-receipt';
      },
    },
    counts: {
      get creates() { return creates; },
      get updates() { return updates; },
      get saves() { return saves; },
    },
  };
}

test('first publish creates a product and persists the project link', async () => {
  const setup = dependencies();
  const result = await publishShopifyProject(
    setup.dependencies,
    context,
    input,
    null,
  );
  assert.equal(result.outcome, 'CREATED');
  assert.equal(result.publication.id, '123456789');
  assert.equal(setup.counts.creates, 1);
  assert.equal(setup.counts.saves, 1);
});

test('existing project linkage controls the Shopify update ID', async () => {
  const setup = dependencies({ currentTitle: 'Old title' });
  const result = await publishShopifyProject(
    setup.dependencies,
    { ...context, publication: reference() },
    input,
    null,
  );
  assert.equal(result.outcome, 'UPDATED');
  assert.deepEqual(result.changedFields, ['title']);
  assert.equal(setup.counts.creates, 0);
  assert.equal(setup.counts.updates, 1);
});

test('no-change updates persist timestamps and return unchanged', async () => {
  const setup = dependencies();
  const result = await publishShopifyProject(
    setup.dependencies,
    { ...context, publication: reference() },
    input,
    null,
  );
  assert.equal(result.outcome, 'UNCHANGED');
  assert.equal(result.changed, false);
  assert.equal(setup.counts.updates, 0);
  assert.equal(setup.counts.saves, 1);
});

test('creation persistence failure returns recovery protection', async () => {
  const setup = dependencies({ saveFails: true });
  const result = await publishShopifyProject(
    setup.dependencies,
    context,
    input,
    null,
  );
  assert.equal(result.outcome, 'LINK_PENDING');
  assert.equal(result.recoveryReceipt, 'encrypted-recovery-receipt');
  assert.equal(setup.counts.creates, 1);
});

test('a verified recovery persists without creating another product', async () => {
  const setup = dependencies();
  const result = await publishShopifyProject(
    setup.dependencies,
    context,
    { ...input, recoveryReceipt: 'encrypted-recovery-receipt' },
    {
      projectId: context.projectId,
      workspaceId: context.workspaceId,
      product: {
        id: '123456789',
        title: 'Alpine Jacket',
        handle: 'alpine-jacket',
        status: 'DRAFT',
      },
    },
  );
  assert.equal(result.outcome, 'RECOVERED');
  assert.equal(setup.counts.creates, 0);
  assert.equal(setup.counts.saves, 1);
});

test('project/workspace mismatch is hidden as unavailable', async () => {
  const setup = dependencies();
  await assert.rejects(
    publishShopifyProject(setup.dependencies, null, input, null),
    (error) => (
      error instanceof ShopifyPublicationError
      && error.code === 'SHOPIFY_PUBLICATION_NOT_FOUND'
      && error.statusCode === 404
    ),
  );
  assert.equal(setup.counts.creates, 0);
});

test('non-OWNER cannot publish', async () => {
  const setup = dependencies();
  await assert.rejects(
    publishShopifyProject(
      setup.dependencies,
      { ...context, role: 'MEMBER' },
      input,
      null,
    ),
    (error) => (
      error instanceof ShopifyPublicationError
      && error.code === 'SHOPIFY_PUBLICATION_FORBIDDEN'
    ),
  );
  assert.equal(setup.counts.creates, 0);
});
