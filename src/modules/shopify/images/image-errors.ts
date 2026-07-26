import { ShopifyAdminApiError } from '../admin/errors.ts';
import { RemoteImageError } from './remote-image.ts';

export type ShopifyImageErrorCode =
  | 'SHOPIFY_IMAGE_FORBIDDEN'
  | 'SHOPIFY_IMAGE_PROJECT_NOT_FOUND'
  | 'SHOPIFY_IMAGE_PROJECT_ARCHIVED'
  | 'SHOPIFY_IMAGE_STORE_NOT_CONNECTED'
  | 'SHOPIFY_IMAGE_FILES_SCOPE_REQUIRED'
  | 'SHOPIFY_IMAGE_PRODUCT_NOT_LINKED'
  | 'SHOPIFY_IMAGE_CONFIGURATION_MISSING'
  | 'SHOPIFY_IMAGE_CONFIG_CONFLICT'
  | 'SHOPIFY_IMAGE_INVALID_INPUT'
  | 'SHOPIFY_IMAGE_UNSAFE_REMOTE'
  | 'SHOPIFY_IMAGE_REMOTE_UNAVAILABLE'
  | 'SHOPIFY_IMAGE_UPLOAD_EXPIRED'
  | 'SHOPIFY_IMAGE_UPLOAD_CONSUMED'
  | 'SHOPIFY_IMAGE_UPLOAD_FAILED'
  | 'SHOPIFY_IMAGE_PRODUCT_NOT_FOUND'
  | 'SHOPIFY_IMAGE_RATE_LIMITED'
  | 'SHOPIFY_IMAGE_TIMEOUT'
  | 'SHOPIFY_IMAGE_INVALID_RESPONSE'
  | 'SHOPIFY_IMAGE_UNAVAILABLE';

export class ShopifyImageError extends Error {
  readonly code: ShopifyImageErrorCode;
  readonly statusCode: 400 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503 | 504;

  constructor(
    code: ShopifyImageErrorCode,
    message: string,
    statusCode: 400 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503 | 504,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ShopifyImageError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeShopifyImageError(error: unknown): ShopifyImageError {
  if (error instanceof ShopifyImageError) return error;
  if (error instanceof RemoteImageError) {
    const unsafe = error.category === 'INVALID_URL'
      || error.category === 'UNSAFE_HOST'
      || error.category === 'INVALID_CONTENT'
      || error.category === 'REDIRECT_LIMIT';
    return new ShopifyImageError(
      unsafe ? 'SHOPIFY_IMAGE_UNSAFE_REMOTE' : 'SHOPIFY_IMAGE_REMOTE_UNAVAILABLE',
      error.message,
      unsafe ? 422 : error.category === 'TIMEOUT' ? 504 : 503,
      { cause: error },
    );
  }
  if (!(error instanceof ShopifyAdminApiError)) {
    return new ShopifyImageError(
      'SHOPIFY_IMAGE_UNAVAILABLE',
      'Shopify images are temporarily unavailable.',
      503,
      { cause: error },
    );
  }
  switch (error.code) {
    case 'SHOPIFY_STORE_NOT_CONNECTED':
    case 'SHOPIFY_ADMIN_UNAUTHORIZED':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_STORE_NOT_CONNECTED',
        'Reconnect Shopify before managing product images.',
        409,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_NOT_FOUND':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_PRODUCT_NOT_FOUND',
        'The linked Shopify product was not found.',
        404,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_REQUEST':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_INVALID_INPUT',
        'Shopify rejected the image operation.',
        422,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_RATE_LIMITED':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_RATE_LIMITED',
        'Shopify is temporarily rate limiting image publishing.',
        429,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_TIMEOUT':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_TIMEOUT',
        'Shopify did not respond in time.',
        504,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_RESPONSE':
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_INVALID_RESPONSE',
        'Shopify returned an invalid image response.',
        502,
        { cause: error },
      );
    default:
      return new ShopifyImageError(
        'SHOPIFY_IMAGE_UNAVAILABLE',
        'Shopify images are temporarily unavailable.',
        503,
        { cause: error },
      );
  }
}

