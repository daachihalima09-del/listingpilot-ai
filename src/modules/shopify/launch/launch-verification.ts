import { z } from 'zod';
import type { ShopifyLaunchOrigin } from './launch-intent.ts';
import { ShopifyLaunchError } from './launch-errors.ts';
import { verifyShopifyOAuthHmac } from '../oauth/hmac.ts';
import { getSafeCallbackPath } from '../../auth/server/redirects.ts';
import { shopDomainSchema } from '../validators/shop-domain.ts';

const SHOPIFY_LAUNCH_MAX_CLOCK_SKEW_SECONDS = 5 * 60;

const launchValuesSchema = z.object({
  shop: shopDomainSchema,
  timestamp: z.string().regex(/^\d{1,12}$/),
  hmac: z.string().regex(/^[a-fA-F0-9]{64}$/),
  host: z.string().min(1).max(1024).optional(),
}).strict();

export interface VerifiedShopifyLaunch {
  shopDomain: string;
  origin: ShopifyLaunchOrigin;
  safeReturnPath: string | null;
}

export function verifyShopifyLaunchRequest(
  url: string | URL,
  apiSecret: string,
  now = new Date(),
): VerifiedShopifyLaunch {
  const searchParams = new URL(url).searchParams;
  for (const key of ['shop', 'timestamp', 'hmac', 'host', 'returnPath']) {
    if (searchParams.getAll(key).length > 1) {
      throw new ShopifyLaunchError('invalid_request');
    }
  }

  const parsed = launchValuesSchema.safeParse({
    shop: searchParams.get('shop') ?? undefined,
    timestamp: searchParams.get('timestamp') ?? undefined,
    hmac: searchParams.get('hmac') ?? undefined,
    host: searchParams.get('host') ?? undefined,
  });
  if (!parsed.success || !verifyShopifyOAuthHmac(searchParams, apiSecret)) {
    throw new ShopifyLaunchError('invalid_request');
  }

  const timestamp = Number(parsed.data.timestamp);
  const age = Math.abs(Math.floor(now.getTime() / 1_000) - timestamp);
  if (!Number.isSafeInteger(timestamp) || age > SHOPIFY_LAUNCH_MAX_CLOCK_SKEW_SECONDS) {
    throw new ShopifyLaunchError('expired');
  }

  const requestedReturnPath = searchParams.get('returnPath');
  const safeReturnPath = requestedReturnPath
    ? getSafeCallbackPath(requestedReturnPath, '/settings/shopify')
    : null;

  return {
    shopDomain: parsed.data.shop,
    origin: parsed.data.host ? 'SHOPIFY_LAUNCH' : 'DISTRIBUTION_INSTALL',
    safeReturnPath,
  };
}

