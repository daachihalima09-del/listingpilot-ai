import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { buildShopifyHmacMessage } from '../oauth/hmac.ts';
import { ShopifyLaunchError } from './launch-errors.ts';
import { verifyShopifyLaunchRequest } from './launch-verification.ts';

const secret = 'test-secret';
const now = new Date('2026-07-27T12:00:00.000Z');

function signedLaunch(overrides: Record<string, string | null> = {}): URL {
  const url = new URL('https://app.example/api/shopify/launch');
  const values: Record<string, string> = {
    shop: 'Example.myshopify.com',
    timestamp: String(Math.floor(now.getTime() / 1000)),
    host: 'YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZXhhbXBsZQ',
  };
  for (const [key, value] of Object.entries({ ...values, ...overrides })) {
    if (value !== null) url.searchParams.set(key, value);
  }
  url.searchParams.set(
    'hmac',
    createHmac('sha256', secret)
      .update(buildShopifyHmacMessage(url.searchParams))
      .digest('hex'),
  );
  return url;
}

test('accepts a valid signed launch and normalizes the permanent domain', () => {
  assert.deepEqual(verifyShopifyLaunchRequest(signedLaunch(), secret, now), {
    shopDomain: 'example.myshopify.com',
    origin: 'SHOPIFY_LAUNCH',
    safeReturnPath: null,
  });
});

test('rejects invalid signatures, missing shops, invalid domains, and duplicates', () => {
  const invalidHmac = signedLaunch();
  invalidHmac.searchParams.set('hmac', '0'.repeat(64));
  const duplicate = signedLaunch();
  duplicate.searchParams.append('shop', 'other.myshopify.com');
  for (const url of [
    invalidHmac,
    signedLaunch({ shop: null }),
    signedLaunch({ shop: 'attacker.example' }),
    duplicate,
  ]) {
    assert.throws(
      () => verifyShopifyLaunchRequest(url, secret, now),
      ShopifyLaunchError,
    );
  }
});

test('rejects stale signed launches without extending the security window', () => {
  const stale = signedLaunch({
    timestamp: String(Math.floor(now.getTime() / 1000) - 301),
  });
  assert.throws(
    () => verifyShopifyLaunchRequest(stale, secret, now),
    (error: unknown) => (
      error instanceof ShopifyLaunchError && error.reason === 'expired'
    ),
  );
});

test('keeps only a safe signed return path and never returns host or HMAC', () => {
  const accepted = verifyShopifyLaunchRequest(
    signedLaunch({ returnPath: '/workspace/project-1' }),
    secret,
    now,
  );
  assert.equal(accepted.safeReturnPath, '/workspace/project-1');
  assert.equal('host' in accepted, false);
  assert.equal('hmac' in accepted, false);

  const blocked = verifyShopifyLaunchRequest(
    signedLaunch({ returnPath: 'https://attacker.example' }),
    secret,
    now,
  );
  assert.equal(blocked.safeReturnPath, '/settings/shopify');
});

