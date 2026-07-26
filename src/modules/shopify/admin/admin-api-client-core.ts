import { normalizeShopDomain } from '../validators/shop-domain.ts';
import {
  normalizeShopifyResponseError,
  ShopifyAdminApiError,
} from './errors.ts';

export type ShopifyAdminMethod =
  | 'GET'
  | 'HEAD'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

export interface ShopifyAdminRequest {
  method?: ShopifyAdminMethod;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

export interface ShopifyAdminResponse {
  data: unknown;
  status: number;
  requestId: string | null;
  apiCallLimit: string | null;
}

export interface ShopifyAdminApiRequester {
  request(input: ShopifyAdminRequest): Promise<ShopifyAdminResponse>;
}

interface ShopifyAdminClientOptions {
  shopDomain: string;
  apiVersion: string;
  accessToken: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  maximumRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

function assertSafePath(path: string): void {
  if (
    !path.startsWith('/')
    || path.startsWith('//')
    || path.includes('?')
    || path.includes('#')
    || path.split('/').includes('..')
  ) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_INVALID_REQUEST',
      message: 'The Shopify API request path is invalid.',
    });
  }
}

function isRetrySafe(method: ShopifyAdminMethod): boolean {
  return method === 'GET' || method === 'HEAD';
}

function retryDelay(attempt: number, random: () => number): number {
  return Math.min(250 * (2 ** attempt) + Math.floor(random() * 100), 2_000);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function parseSuccessfulResponse(
  response: Response,
): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return null;
  if (response.headers.get('content-length') === '0') return null;
  try {
    return await response.json();
  } catch (error) {
    throw new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_INVALID_RESPONSE',
      message: 'Shopify returned an invalid response.',
      statusCode: response.status,
      requestId: response.headers.get('x-request-id') ?? undefined,
      cause: error,
    });
  }
}

export function createShopifyAdminApiClient(
  options: ShopifyAdminClientOptions,
): ShopifyAdminApiRequester {
  const shopDomain = normalizeShopDomain(options.shopDomain);
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maximumRetries = options.maximumRetries ?? 2;
  const sleep = options.sleep ?? (
    (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  );
  const random = options.random ?? Math.random;

  return {
    async request(input) {
      assertSafePath(input.path);
      const method = input.method ?? 'GET';
      const url = new URL(
        `https://${shopDomain}/admin/api/${options.apiVersion}${input.path}`,
      );
      for (const [key, value] of Object.entries(input.query ?? {})) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }

      for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImplementation(url, {
            method,
            headers: {
              accept: 'application/json',
              'X-Shopify-Access-Token': options.accessToken,
              ...(input.body === undefined
                ? {}
                : { 'content-type': 'application/json' }),
            },
            body: input.body === undefined
              ? undefined
              : JSON.stringify(input.body),
            signal: controller.signal,
          });
          if (response.ok) {
            return {
              data: await parseSuccessfulResponse(response),
              status: response.status,
              requestId: response.headers.get('x-request-id')
                ?? response.headers.get('x-shopify-request-id'),
              apiCallLimit: response.headers.get(
                'x-shopify-shop-api-call-limit',
              ),
            };
          }

          const normalized = normalizeShopifyResponseError(response);
          if (
            !isRetrySafe(method)
            || !normalized.retryable
            || attempt >= maximumRetries
          ) {
            throw normalized;
          }
          await sleep(
            normalized.retryAfterMs ?? retryDelay(attempt, random),
          );
        } catch (error) {
          if (error instanceof ShopifyAdminApiError) throw error;
          const normalized = new ShopifyAdminApiError({
            code: isAbortError(error)
              ? 'SHOPIFY_ADMIN_TIMEOUT'
              : 'SHOPIFY_ADMIN_UNAVAILABLE',
            message: isAbortError(error)
              ? 'The Shopify request timed out.'
              : 'Shopify could not be reached.',
            retryable: true,
            cause: error,
          });
          if (!isRetrySafe(method) || attempt >= maximumRetries) {
            throw normalized;
          }
          await sleep(retryDelay(attempt, random));
        } finally {
          clearTimeout(timeout);
        }
      }
    },
  };
}
