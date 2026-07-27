import {
  generateShopifyLaunchNonce,
  hashShopifyLaunchNonce,
  isShopifyLaunchNonce,
  shopifyLaunchIntentExpiresAt,
  type ShopifyLaunchIntentRecord,
  type ShopifyLaunchOrigin,
} from './launch-intent.ts';
import { ShopifyLaunchError } from './launch-errors.ts';

export interface ShopifyLaunchIntentStore {
  create(input: {
    nonceHash: string;
    shopDomain: string;
    origin: ShopifyLaunchOrigin;
    safeReturnPath: string | null;
    expiresAt: Date;
  }): Promise<ShopifyLaunchIntentRecord>;
  findByNonceHash(nonceHash: string): Promise<ShopifyLaunchIntentRecord | null>;
  findById(id: string): Promise<ShopifyLaunchIntentRecord | null>;
  selectWorkspace(input: {
    id: string;
    workspaceId: string;
    userId: string;
    now: Date;
  }): Promise<boolean>;
  markOAuthStarted(id: string, now: Date): Promise<boolean>;
  consume(id: string, now: Date): Promise<boolean>;
  expire(id: string, now: Date): Promise<void>;
}

export async function completeShopifyLaunchIntent(
  store: ShopifyLaunchIntentStore,
  id: string,
  now = new Date(),
): Promise<string> {
  const intent = await store.findById(id);
  if (
    !intent
    || intent.consumedAt
    || intent.expiresAt.getTime() <= now.getTime()
    || intent.status !== 'OAUTH_STARTED'
    || !await store.consume(id, now)
  ) {
    return '/settings/shopify';
  }
  return intent.safeReturnPath ?? '/settings/shopify';
}

export async function createShopifyLaunchIntent(
  store: ShopifyLaunchIntentStore,
  input: {
    shopDomain: string;
    origin: ShopifyLaunchOrigin;
    safeReturnPath?: string | null;
    now?: Date;
  },
): Promise<{ nonce: string; intent: ShopifyLaunchIntentRecord }> {
  const now = input.now ?? new Date();
  const nonce = generateShopifyLaunchNonce();
  const intent = await store.create({
    nonceHash: hashShopifyLaunchNonce(nonce),
    shopDomain: input.shopDomain,
    origin: input.origin,
    safeReturnPath: input.safeReturnPath ?? null,
    expiresAt: shopifyLaunchIntentExpiresAt(now),
  });
  return { nonce, intent };
}

export async function resolveShopifyLaunchIntent(
  store: ShopifyLaunchIntentStore,
  nonce: string,
  now = new Date(),
): Promise<ShopifyLaunchIntentRecord> {
  if (!isShopifyLaunchNonce(nonce)) {
    throw new ShopifyLaunchError('not_found', 404);
  }
  const intent = await store.findByNonceHash(hashShopifyLaunchNonce(nonce));
  if (!intent) {
    throw new ShopifyLaunchError('not_found', 404);
  }
  if (intent.consumedAt || intent.status === 'COMPLETED') {
    throw new ShopifyLaunchError('consumed', 409);
  }
  if (intent.status === 'EXPIRED' || intent.expiresAt.getTime() <= now.getTime()) {
    await store.expire(intent.id, now);
    throw new ShopifyLaunchError('expired', 409);
  }
  return intent;
}
