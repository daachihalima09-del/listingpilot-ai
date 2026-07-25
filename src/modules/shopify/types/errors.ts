export const shopifyErrorCodes = {
  unauthenticated: 'SHOPIFY_UNAUTHENTICATED',
  forbidden: 'SHOPIFY_FORBIDDEN',
  invalidInput: 'SHOPIFY_INVALID_INPUT',
  configuration: 'SHOPIFY_CONFIGURATION_ERROR',
} as const;

export type ShopifyErrorCode =
  (typeof shopifyErrorCodes)[keyof typeof shopifyErrorCodes];

export class ShopifyError extends Error {
  readonly code: ShopifyErrorCode;
  readonly statusCode: 400 | 401 | 403 | 500;

  constructor(
    code: ShopifyErrorCode,
    message: string,
    statusCode: 400 | 401 | 403 | 500,
  ) {
    super(message);
    this.name = 'ShopifyError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ShopifyUnauthenticatedError extends ShopifyError {
  constructor() {
    super(
      shopifyErrorCodes.unauthenticated,
      'Authentication is required.',
      401,
    );
    this.name = 'ShopifyUnauthenticatedError';
  }
}

export class ShopifyForbiddenError extends ShopifyError {
  constructor() {
    super(
      shopifyErrorCodes.forbidden,
      'Only the workspace owner may connect a Shopify store.',
      403,
    );
    this.name = 'ShopifyForbiddenError';
  }
}
