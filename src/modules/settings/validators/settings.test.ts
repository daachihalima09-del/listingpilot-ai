import assert from 'node:assert/strict';
import test from 'node:test';
import {
  organizationUpdateSchema,
  workspaceUpdateSchema,
} from './settings.ts';

const organizationId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

test('organization settings normalize valid names and slugs', () => {
  const result = organizationUpdateSchema.parse({
    organizationId,
    name: '  North Star Commerce  ',
    slug: '  North-Star-Commerce  ',
  });

  assert.deepEqual(result, {
    organizationId,
    name: 'North Star Commerce',
    slug: 'north-star-commerce',
  });
});

test('organization settings reject malformed and unsafe values', () => {
  const result = organizationUpdateSchema.safeParse({
    organizationId,
    name: 'A\u0000B',
    slug: 'not valid!',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    assert.ok(errors.name?.length);
    assert.ok(errors.slug?.length);
  }
});

test('organization settings reject unexpected fields', () => {
  const result = organizationUpdateSchema.safeParse({
    organizationId,
    name: 'North Star',
    slug: 'north-star',
    role: 'OWNER',
  });

  assert.equal(result.success, false);
});

test('workspace settings validate the identifier and name', () => {
  assert.deepEqual(
    workspaceUpdateSchema.parse({
      workspaceId,
      name: '  Main Catalog  ',
    }),
    {
      workspaceId,
      name: 'Main Catalog',
    },
  );

  assert.equal(
    workspaceUpdateSchema.safeParse({
      workspaceId: 'not-a-uuid',
      name: 'x',
    }).success,
    false,
  );
});
