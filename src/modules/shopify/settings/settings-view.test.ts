import assert from 'node:assert/strict';
import test from 'node:test';
import type { ShopifyConnectionStatusDto } from '../services/connection-status.ts';
import {
  getShopifySettingsNotice,
  getShopifySettingsViewState,
} from './settings-view.ts';

function status(
  overrides: Partial<ShopifyConnectionStatusDto> = {},
): ShopifyConnectionStatusDto {
  return {
    status: 'NOT_CONNECTED',
    shopDomain: null,
    shopName: null,
    grantedScopes: [],
    installedAt: null,
    lastVerifiedAt: null,
    disconnectedAt: null,
    canManage: true,
    ...overrides,
  };
}

test('selects configuration-missing, disconnected, and connected views safely', () => {
  assert.equal(
    getShopifySettingsViewState(false, status()),
    'CONFIGURATION_MISSING',
  );
  assert.equal(
    getShopifySettingsViewState(true, status({ status: 'DISCONNECTED' })),
    'DISCONNECTED',
  );
  assert.equal(
    getShopifySettingsViewState(true, status({ status: 'CONNECTED' })),
    'CONNECTED',
  );
});

test('maps only approved OAuth success and error messages', () => {
  assert.deepEqual(getShopifySettingsNotice({ status: 'connected' }), {
    tone: 'success',
    message: 'Your Shopify store is connected.',
  });
  assert.equal(
    getShopifySettingsNotice({ error: '<script>secret</script>' }),
    null,
  );
  assert.match(
    getShopifySettingsNotice({ error: 'invalid_state' })?.message ?? '',
    /expired|valid/i,
  );
});

test('view data contains no Shopify secrets', () => {
  const serialized = JSON.stringify({
    state: getShopifySettingsViewState(true, status({
      status: 'CONNECTED',
      shopDomain: 'example.myshopify.com',
    })),
    notice: getShopifySettingsNotice({ status: 'connected' }),
  });
  for (const secret of ['API secret', 'encryption key', 'database URL', 'access token']) {
    assert.equal(serialized.toLowerCase().includes(secret.toLowerCase()), false);
  }
});
