import { z } from 'zod';
import type { ShopifyConfig } from '../config';
import { ShopifyCallbackError } from '../types/errors.ts';
import { normalizeShopDomain } from '../validators/shop-domain.ts';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string(),
}).passthrough();

const shopResponseSchema = z.object({
  shop: z.object({
    name: z.string().trim().min(1).max(255),
    myshopify_domain: z.string(),
  }).passthrough(),
}).passthrough();

export interface ShopifyTokenResult {
  accessToken: string;
  grantedScopes: string[];
}

export interface VerifiedShop {
  name: string;
  shopDomain: string;
}

type Fetch = typeof fetch;

async function fetchWithTimeout(
  fetchImplementation: Fetch,
  url: string,
  init: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImplementation(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    throw new ShopifyCallbackError(
      'shopify_unavailable',
      'shopify_request_failed',
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeShopifyAuthorizationCode(
  config: ShopifyConfig,
  input: { shopDomain: string; code: string },
  fetchImplementation: Fetch = fetch,
): Promise<ShopifyTokenResult> {
  const response = await fetchWithTimeout(
    fetchImplementation,
    `https://${input.shopDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: config.apiKey,
        client_secret: config.apiSecret,
        code: input.code,
      }),
    },
  );
  if (!response.ok) {
    throw new ShopifyCallbackError('shopify_unavailable', 'token_exchange_failed');
  }

  let untrustedResponse: unknown;
  try {
    untrustedResponse = await response.json();
  } catch {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_token_response');
  }
  const result = tokenResponseSchema.safeParse(untrustedResponse);
  if (!result.success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_token_response');
  }

  const grantedScopes = [...new Set(
    result.data.scope.split(',').map((scope) => scope.trim()).filter(Boolean),
  )];
  return {
    accessToken: result.data.access_token,
    grantedScopes,
  };
}

export async function verifyShopifyShop(
  config: ShopifyConfig,
  input: { shopDomain: string; accessToken: string },
  fetchImplementation: Fetch = fetch,
): Promise<VerifiedShop> {
  const response = await fetchWithTimeout(
    fetchImplementation,
    `https://${input.shopDomain}/admin/api/${config.apiVersion}/shop.json`,
    {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': input.accessToken,
        accept: 'application/json',
      },
    },
  );
  if (!response.ok) {
    throw new ShopifyCallbackError('shopify_unavailable', 'shop_verification_failed');
  }

  let untrustedResponse: unknown;
  try {
    untrustedResponse = await response.json();
  } catch {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_shop_response');
  }
  const result = shopResponseSchema.safeParse(untrustedResponse);
  if (!result.success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_shop_response');
  }

  let canonicalDomain: string;
  try {
    canonicalDomain = normalizeShopDomain(result.data.shop.myshopify_domain);
  } catch {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_shop_response');
  }
  if (canonicalDomain !== input.shopDomain) {
    throw new ShopifyCallbackError('connection_failed', 'shop_mismatch');
  }

  return {
    name: result.data.shop.name,
    shopDomain: canonicalDomain,
  };
}
