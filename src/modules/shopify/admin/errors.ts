export type ShopifyAdminApiErrorCode =
  | 'SHOPIFY_STORE_NOT_CONNECTED'
  | 'SHOPIFY_ADMIN_UNAUTHORIZED'
  | 'SHOPIFY_ADMIN_NOT_FOUND'
  | 'SHOPIFY_ADMIN_INVALID_REQUEST'
  | 'SHOPIFY_ADMIN_RATE_LIMITED'
  | 'SHOPIFY_ADMIN_UNAVAILABLE'
  | 'SHOPIFY_ADMIN_TIMEOUT'
  | 'SHOPIFY_ADMIN_INVALID_RESPONSE';

export class ShopifyAdminApiError extends Error {
  readonly code: ShopifyAdminApiErrorCode;
  readonly statusCode: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly requestId: string | null;

  constructor(input: {
    code: ShopifyAdminApiErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    requestId?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = 'ShopifyAdminApiError';
    this.code = input.code;
    this.statusCode = input.statusCode ?? null;
    this.retryable = input.retryable ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.requestId = input.requestId ?? null;
  }
}

function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 5_000);
  }
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? null
    : Math.min(Math.max(date - now, 0), 5_000);
}

export function normalizeShopifyResponseError(
  response: Response,
  now = Date.now(),
): ShopifyAdminApiError {
  const status = response.status;
  const requestId = response.headers.get('x-request-id')
    ?? response.headers.get('x-shopify-request-id')
    ?? undefined;

  if (status === 401 || status === 403) {
    return new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_UNAUTHORIZED',
      message: 'Shopify rejected the stored connection credentials.',
      statusCode: status,
      requestId,
    });
  }
  if (status === 404) {
    return new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_NOT_FOUND',
      message: 'The requested Shopify resource was not found.',
      statusCode: status,
      requestId,
    });
  }
  if (status === 400 || status === 409 || status === 422) {
    return new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_INVALID_REQUEST',
      message: 'Shopify rejected the request.',
      statusCode: status,
      requestId,
    });
  }
  if (status === 429) {
    return new ShopifyAdminApiError({
      code: 'SHOPIFY_ADMIN_RATE_LIMITED',
      message: 'Shopify is temporarily rate limiting requests.',
      statusCode: status,
      retryable: true,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), now)
        ?? 1_000,
      requestId,
    });
  }

  return new ShopifyAdminApiError({
    code: 'SHOPIFY_ADMIN_UNAVAILABLE',
    message: 'Shopify is temporarily unavailable.',
    statusCode: status,
    retryable: status >= 500,
    requestId,
  });
}
