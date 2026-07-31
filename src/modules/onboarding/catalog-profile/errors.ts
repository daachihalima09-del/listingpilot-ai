export type MerchantCatalogProfileErrorCode =
  | 'AUTH_UNAUTHENTICATED'
  | 'WORKSPACE_FORBIDDEN'
  | 'OWNER_REQUIRED'
  | 'SHOPIFY_NOT_CONNECTED'
  | 'SHOPIFY_UNAVAILABLE'
  | 'INVALID_CATALOG_PROFILE'
  | 'PREFERENCE_CONCURRENCY_CONFLICT';

export class MerchantCatalogProfileError extends Error {
  readonly code: MerchantCatalogProfileErrorCode;
  readonly statusCode: 400 | 401 | 403 | 404 | 409 | 503;

  constructor(
    code: MerchantCatalogProfileErrorCode,
    statusCode: 400 | 401 | 403 | 404 | 409 | 503,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MerchantCatalogProfileError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
