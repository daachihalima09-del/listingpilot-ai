import assert from 'node:assert/strict';
import test from 'node:test';
import { productIdentitySchema } from '../../../modules/products/validators/product.ts';
import { productLookupIdentity } from './product-identity.ts';

const versionedIdentity = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  productId: '33333333-3333-4333-8333-333333333333',
  version: 7,
};

test('analysis lookup omits the route-only optimistic-concurrency version', () => {
  assert.deepEqual(productIdentitySchema.parse(productLookupIdentity(versionedIdentity)), {
    workspaceId: versionedIdentity.workspaceId,
    projectId: versionedIdentity.projectId,
    productId: versionedIdentity.productId,
  });
});

test('Product identity remains strict for fields outside its service boundary', () => {
  assert.throws(() => productIdentitySchema.parse(versionedIdentity));
});
