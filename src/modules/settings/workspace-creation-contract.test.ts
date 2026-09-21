import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { workspaceProjectsPath } from './workspace-navigation.ts';

const root = process.cwd();

test('workspace creation redirects using the exact newly created workspace identity', () => {
  assert.equal(
    workspaceProjectsPath({
      organizationId: '22222222-2222-4222-8222-222222222222',
      workspaceId: '33333333-3333-4333-8333-333333333333',
    }),
    '/projects?organizationId=22222222-2222-4222-8222-222222222222&workspaceId=33333333-3333-4333-8333-333333333333',
  );
});

test('the creation endpoint rejects missing or inactive authentication before its service call', async () => {
  const source = await readFile(`${root}/src/app/api/settings/workspace/route.ts`, 'utf8');
  const authenticationCheck = source.indexOf("if (!user || user.status !== 'ACTIVE')");
  const creationCall = source.indexOf('createWorkspace(user.id, input)');

  assert.notEqual(authenticationCheck, -1);
  assert.notEqual(creationCall, -1);
  assert.ok(authenticationCheck < creationCall);
  assert.match(source, /return unauthenticatedSettingsResponse\(\)/u);
});

test('the Settings UI exposes creation only to an owner and submits with duplicate protection', async () => {
  const page = await readFile(`${root}/src/app/settings/workspace/page.tsx`, 'utf8');
  const form = await readFile(`${root}/src/modules/settings/components/CreateWorkspaceForm.tsx`, 'utf8');
  const mutation = await readFile(`${root}/src/modules/settings/client/use-settings-mutation.ts`, 'utf8');

  assert.match(page, /canManage \? \(/u);
  assert.match(page, /CreateWorkspaceForm/u);
  assert.match(form, /isSubmitting/u);
  assert.match(form, /router\.push\(result\.redirectTo\)/u);
  assert.match(mutation, /if \(activeRequest\.current\)/u);
});
