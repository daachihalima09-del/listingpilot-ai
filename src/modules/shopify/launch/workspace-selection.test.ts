import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getShopifyLaunchWorkspaceOptions,
  type ShopifyLaunchWorkspace,
} from './workspace-selection.ts';

const workspace = (
  id: string,
  role: ShopifyLaunchWorkspace['role'],
): ShopifyLaunchWorkspace => ({
  id,
  organizationId: '11111111-1111-4111-8111-111111111111',
  name: id,
  organizationName: 'Example',
  role,
});

test('automatically selects exactly one OWNER workspace', async () => {
  const result = await getShopifyLaunchWorkspaceOptions({
    async listForUser() {
      return [workspace('owner-1', 'OWNER'), workspace('viewer-1', 'VIEWER')];
    },
    async findForUser() { return null; },
  }, 'user-1');
  assert.equal(result.automaticallySelectedWorkspaceId, 'owner-1');
  assert.equal(result.viewOnlyWorkspaces.length, 1);
});

test('requires controlled selection for multiple OWNER workspaces', async () => {
  const result = await getShopifyLaunchWorkspaceOptions({
    async listForUser() {
      return [workspace('owner-1', 'OWNER'), workspace('owner-2', 'OWNER')];
    },
    async findForUser() { return null; },
  }, 'user-1');
  assert.equal(result.automaticallySelectedWorkspaceId, null);
  assert.equal(result.ownerWorkspaces.length, 2);
});

