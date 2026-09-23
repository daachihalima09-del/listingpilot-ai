import { z } from 'zod';
import type { ShopifyConfig } from '../config';
import { ShopifyCallbackError } from '../types/errors.ts';
import { normalizeShopDomain } from '../validators/shop-domain.ts';

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  scope: z.string(),
}).passthrough();

const shopResponseSchema = z.object({
  data: z.object({
    shop: z.object({
      id: z.string().regex(/^gid:\/\/shopify\/Shop\/\d+$/u),
      name: z.string().trim().min(1).max(255),
      myshopifyDomain: z.string(),
    }),
  }),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
}).passthrough();

const shopGraphqlErrorSchema = z.object({
  errors: z.array(z.object({
    message: z.string(),
  }).passthrough()).min(1),
}).passthrough();

const accessScopesResponseSchema = z.object({
  data: z.object({
    currentAppInstallation: z.object({
      accessScopes: z.array(z.object({
        handle: z.string().trim().min(1),
      })),
    }),
  }),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
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
    `https://${input.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': input.accessToken,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: `query ListingPilotVerifyShop {
          shop { id name myshopifyDomain }
        }`,
      }),
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
  if (shopGraphqlErrorSchema.safeParse(untrustedResponse).success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'shop_verification_failed');
  }
  const result = shopResponseSchema.safeParse(untrustedResponse);
  if (!result.success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_shop_response');
  }

  let canonicalDomain: string;
  try {
    canonicalDomain = normalizeShopDomain(
      result.data.data.shop.myshopifyDomain,
    );
  } catch {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_shop_response');
  }
  if (canonicalDomain !== input.shopDomain) {
    throw new ShopifyCallbackError('connection_failed', 'shop_mismatch');
  }

  return {
    name: result.data.data.shop.name,
    shopDomain: canonicalDomain,
  };
}

export async function fetchShopifyGrantedScopes(
  config: ShopifyConfig,
  input: { shopDomain: string; accessToken: string },
  fetchImplementation: Fetch = fetch,
): Promise<string[]> {
  const response = await fetchWithTimeout(
    fetchImplementation,
    `https://${input.shopDomain}/admin/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': input.accessToken,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: `query ListingPilotGrantedScopes {
          currentAppInstallation { accessScopes { handle } }
        }`,
      }),
    },
  );
  if (!response.ok) {
    throw new ShopifyCallbackError('shopify_unavailable', 'scope_verification_failed');
  }

  let untrustedResponse: unknown;
  try {
    untrustedResponse = await response.json();
  } catch {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_scope_response');
  }
  if (shopGraphqlErrorSchema.safeParse(untrustedResponse).success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'scope_verification_failed');
  }
  const result = accessScopesResponseSchema.safeParse(untrustedResponse);
  if (!result.success) {
    throw new ShopifyCallbackError('shopify_unavailable', 'invalid_scope_response');
  }

  return [...new Set(
    result.data.data.currentAppInstallation.accessScopes
      .map(({ handle }) => handle),
  )];
}
