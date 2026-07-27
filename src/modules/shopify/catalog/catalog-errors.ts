export type ShopifyCatalogErrorCode =
  | 'SHOPIFY_NOT_CONNECTED'
  | 'SHOPIFY_TOKEN_INVALID'
  | 'SHOPIFY_THROTTLED'
  | 'SHOPIFY_UNAVAILABLE'
  | 'PRODUCT_NOT_FOUND'
  | 'INVALID_PRODUCT_REFERENCE'
  | 'WORKSPACE_FORBIDDEN'
  | 'LINK_INCONSISTENT'
  | 'SOURCE_SNAPSHOT_TOO_LARGE'
  | 'IMPORT_FAILED';

export class ShopifyCatalogError extends Error {
  readonly code: ShopifyCatalogErrorCode;
  readonly statusCode: 400 | 403 | 404 | 409 | 413 | 500 | 503;

  constructor(
    code: ShopifyCatalogErrorCode,
    statusCode: 400 | 403 | 404 | 409 | 413 | 500 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'ShopifyCatalogError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
