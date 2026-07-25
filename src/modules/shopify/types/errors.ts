export const shopifyErrorCodes = {
  unauthenticated: 'SHOPIFY_UNAUTHENTICATED',
  forbidden: 'SHOPIFY_FORBIDDEN',
  invalidInput: 'SHOPIFY_INVALID_INPUT',
  configuration: 'SHOPIFY_CONFIGURATION_ERROR',
  invalidCallback: 'SHOPIFY_INVALID_CALLBACK',
  invalidState: 'SHOPIFY_INVALID_STATE',
  unavailable: 'SHOPIFY_UNAVAILABLE',
  connectionFailed: 'SHOPIFY_CONNECTION_FAILED',
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

export type ShopifyCallbackErrorReason =
  | 'invalid_callback'
  | 'invalid_state'
  | 'shopify_unavailable'
  | 'connection_failed';

export class ShopifyCallbackError extends Error {
  readonly reason: ShopifyCallbackErrorReason;
  readonly safeCategory: string;

  constructor(
    reason: ShopifyCallbackErrorReason,
    safeCategory: string,
    options?: ErrorOptions,
  ) {
    super('The Shopify callback could not be completed.', options);
    this.name = 'ShopifyCallbackError';
    this.reason = reason;
    this.safeCategory = safeCategory;
  }
}

export class ShopifyDuplicateShopError extends ShopifyCallbackError {
  constructor() {
    super('connection_failed', 'duplicate_shop');
    this.name = 'ShopifyDuplicateShopError';
  }
}
