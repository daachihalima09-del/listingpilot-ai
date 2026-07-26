import { ShopifyAdminApiError } from '../admin/errors.ts';

export type ShopifyVariantErrorCode =
  | 'SHOPIFY_VARIANT_FORBIDDEN'
  | 'SHOPIFY_VARIANT_PROJECT_NOT_FOUND'
  | 'SHOPIFY_VARIANT_PROJECT_ARCHIVED'
  | 'SHOPIFY_VARIANT_PRODUCT_NOT_LINKED'
  | 'SHOPIFY_VARIANT_CONFIGURATION_MISSING'
  | 'SHOPIFY_VARIANT_CONFIG_CONFLICT'
  | 'SHOPIFY_VARIANT_OPTION_CONFLICT'
  | 'SHOPIFY_VARIANT_NOT_FOUND'
  | 'SHOPIFY_VARIANT_VALIDATION_FAILED'
  | 'SHOPIFY_VARIANT_RATE_LIMITED'
  | 'SHOPIFY_VARIANT_TIMEOUT'
  | 'SHOPIFY_VARIANT_UNAVAILABLE'
  | 'SHOPIFY_VARIANT_INVALID_RESPONSE'
  | 'SHOPIFY_VARIANT_PERSISTENCE_FAILED'
  | 'SHOPIFY_VARIANT_PARTIAL';

export class ShopifyVariantError extends Error {
  readonly code: ShopifyVariantErrorCode;
  readonly statusCode: 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504;

  constructor(
    code: ShopifyVariantErrorCode,
    message: string,
    statusCode: 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ShopifyVariantError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeShopifyVariantError(error: unknown): ShopifyVariantError {
  if (error instanceof ShopifyVariantError) return error;
  if (!(error instanceof ShopifyAdminApiError)) {
    return new ShopifyVariantError(
      'SHOPIFY_VARIANT_UNAVAILABLE',
      'Shopify variants could not be updated.',
      503,
      { cause: error },
    );
  }
  switch (error.code) {
    case 'SHOPIFY_STORE_NOT_CONNECTED':
    case 'SHOPIFY_ADMIN_UNAUTHORIZED':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_UNAVAILABLE',
        'Reconnect Shopify before publishing variants.',
        409,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_NOT_FOUND':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_NOT_FOUND',
        'The linked Shopify product or variant was not found.',
        404,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_REQUEST':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_VALIDATION_FAILED',
        'Shopify rejected the variant configuration.',
        422,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_RATE_LIMITED':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_RATE_LIMITED',
        'Shopify is temporarily rate limiting variant publishing.',
        429,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_TIMEOUT':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_TIMEOUT',
        'Shopify did not respond in time.',
        504,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_RESPONSE':
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_INVALID_RESPONSE',
        'Shopify returned an invalid variant response.',
        502,
        { cause: error },
      );
    default:
      return new ShopifyVariantError(
        'SHOPIFY_VARIANT_UNAVAILABLE',
        'Shopify variants are temporarily unavailable.',
        503,
        { cause: error },
      );
  }
}
