import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { ShopifyCallbackError } from '../types/errors.ts';

export const SHOPIFY_OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function generateShopifyOAuthState(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShopifyOAuthState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}

function statesMatch(left: string, right: string): boolean {
  const leftHash = Buffer.from(hashShopifyOAuthState(left), 'hex');
  const rightHash = Buffer.from(hashShopifyOAuthState(right), 'hex');
  return timingSafeEqual(leftHash, rightHash);
}

export interface ShopifyOAuthStateBinding {
  stateHash: string;
  userId: string;
  workspaceId: string;
  shopDomain: string;
  expiresAt: Date;
  consumedAt: Date | null;
  launchIntentId?: string | null;
}

interface VerifyShopifyOAuthStateInput {
  queryState: string;
  cookieState: string | undefined;
  actorUserId: string;
  activeWorkspaceId: string;
  shopDomain: string;
  now?: Date;
}

export function verifyShopifyOAuthStateBinding(
  binding: ShopifyOAuthStateBinding,
  input: VerifyShopifyOAuthStateInput,
): void {
  const now = input.now ?? new Date();
  if (!input.cookieState) {
    throw new ShopifyCallbackError('missing_cookie', 'missing_cookie');
  }
  if (
    !statesMatch(input.queryState, input.cookieState)
    || binding.stateHash !== hashShopifyOAuthState(input.queryState)
  ) {
    throw new ShopifyCallbackError('invalid_state', 'state_mismatch');
  }
  if (binding.userId !== input.actorUserId) {
    throw new ShopifyCallbackError('user_mismatch', 'user_mismatch');
  }
  if (binding.workspaceId !== input.activeWorkspaceId) {
    throw new ShopifyCallbackError('workspace_mismatch', 'workspace_mismatch');
  }
  if (binding.shopDomain !== input.shopDomain) {
    throw new ShopifyCallbackError('shop_mismatch', 'shop_mismatch');
  }
  if (binding.expiresAt.getTime() <= now.getTime()) {
    throw new ShopifyCallbackError('expired_state', 'expired_state');
  }
  if (binding.consumedAt !== null) {
    throw new ShopifyCallbackError('consumed_state', 'consumed_state');
  }
}

export function shopifyOAuthStateExpiresAt(now = new Date()): Date {
  return new Date(
    now.getTime() + SHOPIFY_OAUTH_STATE_MAX_AGE_SECONDS * 1_000,
  );
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

export function expiredShopifyOAuthStateCookieOptions(
  secure = process.env.NODE_ENV === 'production',
) {
  return {
    ...shopifyOAuthStateCookieOptions(secure),
    maxAge: 0,
  };
}
