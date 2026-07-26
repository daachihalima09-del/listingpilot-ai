export type ShopifyPublicationErrorCode =
  | 'SHOPIFY_PUBLICATION_FORBIDDEN'
  | 'SHOPIFY_PUBLICATION_NOT_FOUND'
  | 'SHOPIFY_CONFIGURATION_MISSING'
  | 'SHOPIFY_PUBLICATION_RECOVERY_INVALID'
  | 'SHOPIFY_PUBLICATION_PERSISTENCE_FAILED';

export class ShopifyPublicationError extends Error {
  readonly code: ShopifyPublicationErrorCode;
  readonly statusCode: 403 | 404 | 409 | 503;

  constructor(
    code: ShopifyPublicationErrorCode,
    message: string,
    statusCode: 403 | 404 | 409 | 503,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ShopifyPublicationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
