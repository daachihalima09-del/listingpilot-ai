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
    '/settings/shopify',
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
