import assert from 'node:assert/strict';
import test from 'node:test';
import { publishShopifyProject } from '../publishing/publication-service.ts';

test('an imported project with incomplete linkage never falls back to create', async () => {
  let creates = 0;
  await assert.rejects(
    publishShopifyProject({
      publications: {
        async resolveProject() { return null; },
        async findForProject() { return null; },
        async save() { throw new Error('unused'); },
        async saveCreated() { throw new Error('unused'); },
      },
      products: {
        async create() { creates += 1; throw new Error('must not create'); },
        async findCurrent() { throw new Error('unused'); },
        async update() { throw new Error('unused'); },
      },
      updateAudit: { async recordUpdated() {} },
      createRecoveryReceipt() { return ''; },
    }, {
      actorUserId: 'user-1',
      organizationId: 'org-1',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      role: 'OWNER',
      publication: null,
      importedProductLink: { valid: true },
    }, {
      product: {
        title: 'Example',
        descriptionHtml: '',
        vendor: '',
        productType: '',
        tags: [],
        status: 'DRAFT',
      },
    }, null),
    (error: unknown) => (
      error instanceof Error && error.message.includes('cannot create a replacement')
    ),
  );
  assert.equal(creates, 0);
});

