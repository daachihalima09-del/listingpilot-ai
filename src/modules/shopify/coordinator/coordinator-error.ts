export class ShopifyCoordinatorError extends Error {
  readonly code: string;
  readonly statusCode: 400 | 403 | 404 | 409 | 500 | 503;

  constructor(
    code: string,
    message: string,
    statusCode: 400 | 403 | 404 | 409 | 500 | 503,
  ) {
    super(message);
    this.name = 'ShopifyCoordinatorError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
