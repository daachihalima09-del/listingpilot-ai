import { ShopifyAdminApiError } from '../admin/errors.ts';

export type ShopifyMetafieldErrorCode =
  | 'SHOPIFY_METAFIELD_FORBIDDEN'
  | 'SHOPIFY_METAFIELD_PROJECT_NOT_FOUND'
  | 'SHOPIFY_METAFIELD_PROJECT_ARCHIVED'
  | 'SHOPIFY_METAFIELD_CONFIGURATION_MISSING'
  | 'SHOPIFY_METAFIELD_CONFIG_CONFLICT'
  | 'SHOPIFY_METAFIELD_PRODUCT_NOT_LINKED'
  | 'SHOPIFY_METAFIELD_STORE_NOT_CONNECTED'
  | 'SHOPIFY_METAFIELD_DEFINITION_CONFLICT'
  | 'SHOPIFY_METAFIELD_DEFINITION_FAILED'
  | 'SHOPIFY_METAFIELD_PRODUCT_NOT_FOUND'
  | 'SHOPIFY_METAFIELD_VALIDATION_FAILED'
  | 'SHOPIFY_METAFIELD_RATE_LIMITED'
  | 'SHOPIFY_METAFIELD_TIMEOUT'
  | 'SHOPIFY_METAFIELD_INVALID_RESPONSE'
  | 'SHOPIFY_METAFIELD_UNAVAILABLE'
  | 'SHOPIFY_METAFIELD_PARTIAL';

export class ShopifyMetafieldError extends Error {
  readonly code: ShopifyMetafieldErrorCode;
  readonly statusCode: 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504;

  constructor(
    code: ShopifyMetafieldErrorCode,
    message: string,
    statusCode: 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ShopifyMetafieldError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ShopifyMetafieldDefinitionRaceError extends Error {
  constructor() {
    super('Metafield definition already exists.');
    this.name = 'ShopifyMetafieldDefinitionRaceError';
  }
}

export function normalizeShopifyMetafieldError(
  error: unknown,
): ShopifyMetafieldError {
  if (error instanceof ShopifyMetafieldError) return error;
  if (!(error instanceof ShopifyAdminApiError)) {
    return new ShopifyMetafieldError(
      'SHOPIFY_METAFIELD_UNAVAILABLE',
      'Shopify metafields are temporarily unavailable.',
      503,
      { cause: error },
    );
  }
  switch (error.code) {
    case 'SHOPIFY_STORE_NOT_CONNECTED':
    case 'SHOPIFY_ADMIN_UNAUTHORIZED':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_STORE_NOT_CONNECTED',
        'Reconnect Shopify before publishing metafields.',
        409,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_NOT_FOUND':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_PRODUCT_NOT_FOUND',
        'The linked Shopify product was not found.',
        404,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_REQUEST':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_VALIDATION_FAILED',
        'Shopify rejected the metafield operation.',
        422,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_RATE_LIMITED':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_RATE_LIMITED',
        'Shopify is temporarily rate limiting metafield publishing.',
        429,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_TIMEOUT':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_TIMEOUT',
        'Shopify did not respond in time.',
        504,
        { cause: error },
      );
    case 'SHOPIFY_ADMIN_INVALID_RESPONSE':
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_INVALID_RESPONSE',
        'Shopify returned an invalid metafield response.',
        502,
        { cause: error },
      );
    default:
      return new ShopifyMetafieldError(
        'SHOPIFY_METAFIELD_UNAVAILABLE',
        'Shopify metafields are temporarily unavailable.',
        503,
        { cause: error },
      );
  }
}
