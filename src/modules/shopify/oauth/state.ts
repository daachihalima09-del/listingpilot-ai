import { randomBytes } from 'node:crypto';

export const SHOPIFY_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function generateShopifyOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function shopifyOAuthStateCookieName(
  secure = process.env.NODE_ENV === 'production',
): string {
  return secure
    ? '__Secure-listingpilot.shopify-oauth-state'
    : 'listingpilot.shopify-oauth-state';
}

export function shopifyOAuthStateCookieOptions(
  secure = process.env.NODE_ENV === 'production',
) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/api/shopify',
    maxAge: SHOPIFY_OAUTH_STATE_MAX_AGE_SECONDS,
  };
}
