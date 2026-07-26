import { ShopifyAdminApiError } from '../admin/errors.ts';

export type ShopifyProductPublishErrorCode =
  | 'SHOPIFY_PRODUCT_FORBIDDEN'
  | 'SHOPIFY_PRODUCT_STORE_NOT_CONNECTED'
  | 'SHOPIFY_PRODUCT_REAUTHORIZATION_REQUIRED'
  | 'SHOPIFY_PRODUCT_VALIDATION_FAILED'
  | 'SHOPIFY_PRODUCT_RATE_LIMITED'
  | 'SHOPIFY_PRODUCT_TIMEOUT'
  | 'SHOPIFY_PRODUCT_UNAVAILABLE'
  | 'SHOPIFY_PRODUCT_INVALID_RESPONSE';

export class ShopifyProductPublishError extends Error {
  readonly code: ShopifyProductPublishErrorCode;
  readonly statusCode: 403 | 409 | 422 | 429 | 502 | 503 | 504;

  constructor(
    code: ShopifyProductPublishErrorCode,
    message: string,
    statusCode: 403 | 409 | 422 | 429 | 502 | 503 | 504,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ShopifyProductPublishError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeShopifyProductError(
  error: unknown,
): ShopifyProductPublishError {
  if (error instanceof ShopifyProductPublishError) return error;
  if (!(error instanceof ShopifyAdminApiError)) {
    return new ShopifyProductPublishError(
      'SHOPIFY_PRODUCT_UNAVAILABLE',
      'The Shopify product could not be created.',
      503,
      { cause: error },
    );
  }

  switch (error.code) {
    case 'SHOPIFY_STORE_NOT_CONNECTED':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_STORE_NOT_CONNECTED',
        'Connect a Shopify store before publishing products.',
        409,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_UNAUTHORIZED':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_REAUTHORIZATION_REQUIRED',
        'Reconnect the Shopify store before publishing products.',
        409,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_REQUEST':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_VALIDATION_FAILED',
        'Shopify rejected the product details.',
        422,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_RATE_LIMITED':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_RATE_LIMITED',
        'Shopify is temporarily rate limiting product publishing.',
        429,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_TIMEOUT':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_TIMEOUT',
        'Shopify did not respond in time.',
        504,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_RESPONSE':
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_INVALID_RESPONSE',
        'Shopify returned an invalid product response.',
        502,
        { cause: error },
      );
    default:
      return new ShopifyProductPublishError(
        'SHOPIFY_PRODUCT_UNAVAILABLE',
        'Shopify is temporarily unavailable.',
        503,
        { cause: error },
      );
  }
}
