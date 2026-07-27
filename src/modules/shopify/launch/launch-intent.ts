import {
  createHash,
  randomBytes,
} from 'node:crypto';

export const SHOPIFY_LAUNCH_INTENT_MAX_AGE_SECONDS = 15 * 60;

export type ShopifyLaunchIntentStatus =
  | 'PENDING'
  | 'WORKSPACE_SELECTED'
  | 'OAUTH_STARTED'
  | 'COMPLETED'
  | 'EXPIRED';

export type ShopifyLaunchOrigin =
  | 'DISTRIBUTION_INSTALL'
  | 'SHOPIFY_LAUNCH';

export interface ShopifyLaunchIntentRecord {
  id: string;
  nonceHash: string;
  shopDomain: string;
  origin: ShopifyLaunchOrigin;
  status: ShopifyLaunchIntentStatus;
  requestedWorkspaceId: string | null;
  selectedByUserId: string | null;
  safeReturnPath: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export function generateShopifyLaunchNonce(): string {
  return randomBytes(32).toString('base64url');
}

export function hashShopifyLaunchNonce(nonce: string): string {
  return createHash('sha256').update(nonce, 'utf8').digest('hex');
}

export function shopifyLaunchIntentExpiresAt(now = new Date()): Date {
  return new Date(
    now.getTime() + SHOPIFY_LAUNCH_INTENT_MAX_AGE_SECONDS * 1_000,
  );
}

export function isShopifyLaunchNonce(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

