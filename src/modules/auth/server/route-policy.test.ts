import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRouteAccessDecision,
  isPublicRoute,
} from './route-policy.ts';

test('marketing, authentication, and Auth.js routes remain public', () => {
  for (const route of [
    '/about',
    '/landing',
    '/sign-in',
    '/sign-up',
    '/api/auth/session',
    '/shopify/launch',
    '/api/shopify/launch',
    '/api/shopify/webhooks/app-uninstalled',
  ]) {
    assert.equal(isPublicRoute(route), true, `${route} should be public`);
  }
});

test('merchant application and product-analysis routes are protected', () => {
  for (const route of [
    '/',
    '/catalog',
    '/workspace/example',
    '/projects',
    '/projects/example',
    '/dashboard',
    '/api/analyze',
    '/api/projects',
    '/api/shopify/connect',
    '/api/shopify/callback',
    '/api/shopify/disconnect',
    '/api/shopify/products',
  '/api/shopify/products/123456789',
  '/api/projects/11111111-1111-4111-8111-111111111111/shopify-publication',
  '/api/projects/11111111-1111-4111-8111-111111111111/shopify-variants',
  '/api/projects/11111111-1111-4111-8111-111111111111/shopify-variants/publish',
    '/settings/shopify',
    '/settings/business-profile/catalog',
    '/settings/business-profile/listing-standard',
    '/settings/business-profile/listing',
    '/settings/business-profile/seo',
    '/settings/business-profile/publishing',
    '/settings/business-profile/ai',
    '/settings/business-profile/listing/calibration',
  ]) {
    assert.deepEqual(
      getRouteAccessDecision(route, false),
      { type: 'redirect-to-sign-in' },
    );
  }
});

test('authenticated users are redirected away from authentication pages', () => {
  for (const route of ['/sign-in', '/sign-up']) {
    assert.deepEqual(
      getRouteAccessDecision(route, true),
      { type: 'redirect-to-authenticated-home' },
    );
  }
});

test('authenticated users can access protected application routes', () => {
  assert.deepEqual(getRouteAccessDecision('/catalog', true), { type: 'allow' });
});
