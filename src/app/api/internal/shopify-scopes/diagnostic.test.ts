import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { handleShopifyScopesDiagnostic } from './diagnostic.ts';

const organizationId = '22222222-2222-4222-8222-222222222222';
const expected = 'read_products,write_products,read_files,write_files';

function setup(options: {
  user?: { id: string; status: string } | null;
  role?: string;
  tenantOrganizationId?: string;
  tenantError?: Error;
  scopes?: string;
} = {}) {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      async getUser() {
        calls.push('user');
        return options.user === undefined ? { id: 'actor', status: 'ACTIVE' } : options.user;
      },
      async getTenant(userId: string, selectedOrganizationId: string) {
        calls.push('tenant');
        assert.equal(userId, 'actor');
        assert.equal(selectedOrganizationId, organizationId);
        if (options.tenantError) throw options.tenantError;
        return {
          role: options.role ?? 'OWNER',
          organization: { id: options.tenantOrganizationId ?? organizationId },
        };
      },
      readScopes() {
        calls.push('environment');
        return options.scopes;
      },
    },
  };
}

function request(query = `organizationId=${organizationId}`): Request {
  return new Request(`https://app.example/api/internal/shopify-scopes?${query}`);
}

test('unauthenticated and inactive users cannot resolve tenants or read scopes', async () => {
  for (const [user, status] of [
    [null, 401],
    [{ id: 'actor', status: 'SUSPENDED' }, 403],
  ] as const) {
    const context = setup({ user });
    const result = await handleShopifyScopesDiagnostic(request(), context.dependencies);
    assert.equal(result.status, status);
    assert.equal(await result.text(), '');
    assert.deepEqual(context.calls, ['user']);
    assert.match(result.headers.get('Cache-Control') ?? '', /no-store/);
  }
});

test('non-OWNER and cross-organization access fail before environment access', async () => {
  for (const options of [
    { role: 'ADMIN' }, { role: 'MEMBER' }, { role: 'VIEWER' },
    { tenantOrganizationId: '33333333-3333-4333-8333-333333333333' },
    { tenantError: new Error('sensitive membership failure') },
  ]) {
    const context = setup(options);
    const result = await handleShopifyScopesDiagnostic(request(), context.dependencies);
    assert.equal(result.status, 403);
    assert.equal(await result.text(), '');
    assert.deepEqual(context.calls, ['user', 'tenant']);
  }
});

test('explicit organization is required and duplicate or arbitrary inputs are rejected', async () => {
  for (const query of [
    '', 'organizationId=invalid',
    `organizationId=${organizationId}&organizationId=${organizationId}`,
    `organizationId=${organizationId}&expectedScopes=${expected}`,
  ]) {
    const context = setup();
    const result = await handleShopifyScopesDiagnostic(request(query), context.dependencies);
    assert.equal(result.status, 400);
    assert.equal(await result.text(), '');
    assert.deepEqual(context.calls, ['user']);
  }
});

test('normalizes order, whitespace and duplicates but requires the exact four handles', async () => {
  const context = setup({ scopes: ' write_files, read_files,write_products,read_products,write_files, ' });
  const result = await handleShopifyScopesDiagnostic(request(), context.dependencies);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), {
    variablePresent: true, exactMatch: true, unexpectedScopesPresent: false,
  });
  assert.deepEqual(context.calls, ['user', 'tenant', 'environment']);
  assert.match(result.headers.get('Cache-Control') ?? '', /no-store/);
  assert.equal(result.headers.get('Vary'), 'Cookie');
});

test('missing, empty, incomplete and unexpected scope sets return only booleans', async () => {
  for (const [scopes, present, unexpected] of [
    [undefined, false, false], ['', true, false],
    ['write_products,write_files', true, false],
    [`${expected},read_orders`, true, true],
    ['sensitive-canary-value', true, true],
  ] as const) {
    const context = setup({ scopes });
    const result = await handleShopifyScopesDiagnostic(request(), context.dependencies);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), {
      variablePresent: present, exactMatch: false, unexpectedScopesPresent: unexpected,
    });
  }
});

test('internal exceptions never disclose errors, raw values or authentication input', async () => {
  const context = setup({ scopes: 'sensitive-canary-value' });
  context.dependencies.readScopes = () => { throw new Error('sensitive-canary-value'); };
  const result = await handleShopifyScopesDiagnostic(request(), context.dependencies);
  assert.equal(result.status, 503);
  assert.equal(await result.text(), '');
});

test('route uses runtime environment and established auth with no logging or mutation adapters', () => {
  const route = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
  const handler = readFileSync(new URL('./diagnostic.ts', import.meta.url), 'utf8');
  assert.match(route, /readScopes: \(\) => process\.env\.SHOPIFY_SCOPES/);
  assert.match(route, /getUser: getCurrentUser/);
  assert.match(route, /getTenantContextForUser\(userId, \{\s*organizationId/);
  assert.match(route, /dynamic = 'force-dynamic'/);
  assert.doesNotMatch(route + handler, /console\.|fetch\(|prisma\.|accessToken|authorizationCode/);
});
