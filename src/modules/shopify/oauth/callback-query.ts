import { z } from 'zod';
import { ShopifyCallbackError } from '../types/errors.ts';
import { shopDomainSchema } from '../validators/shop-domain.ts';

const callbackValuesSchema = z.object({
  code: z.string().min(1).max(2048),
  hmac: z.string().regex(/^[a-fA-F0-9]{64}$/),
  shop: shopDomainSchema,
  state: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  timestamp: z.string().regex(/^\d{1,12}$/).optional(),
}).strict();

export interface ShopifyCallbackQuery {
  code: string;
  hmac: string;
  shop: string;
  state: string;
  timestamp?: number;
  searchParams: URLSearchParams;
}

export function parseShopifyCallbackQuery(
  url: string | URL,
  now = new Date(),
): ShopifyCallbackQuery {
  const searchParams = new URL(url).searchParams;
  for (const key of ['code', 'hmac', 'shop', 'state', 'timestamp']) {
    if (searchParams.getAll(key).length > 1) {
      throw new ShopifyCallbackError('invalid_callback', 'duplicate_parameter');
    }
  }

  const result = callbackValuesSchema.safeParse({
    code: searchParams.get('code') ?? undefined,
    hmac: searchParams.get('hmac') ?? undefined,
    shop: searchParams.get('shop') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    timestamp: searchParams.get('timestamp') ?? undefined,
  });
  if (!result.success) {
    throw new ShopifyCallbackError('invalid_callback', 'invalid_parameters');
  }

  const timestamp = result.data.timestamp
    ? Number(result.data.timestamp)
    : undefined;
  if (
    timestamp !== undefined
    && Math.abs(Math.floor(now.getTime() / 1_000) - timestamp) > 5 * 60
  ) {
    throw new ShopifyCallbackError('invalid_callback', 'invalid_timestamp');
  }

  return {
    ...result.data,
    timestamp,
    searchParams,
  };
}
