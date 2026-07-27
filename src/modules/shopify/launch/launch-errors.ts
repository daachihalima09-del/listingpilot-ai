export type ShopifyLaunchErrorReason =
  | 'invalid_request'
  | 'expired'
  | 'consumed'
  | 'not_found'
  | 'owner_required'
  | 'workspace_unavailable'
  | 'shop_mismatch'
  | 'connection_invalid';

export class ShopifyLaunchError extends Error {
  readonly reason: ShopifyLaunchErrorReason;
  readonly statusCode: 400 | 403 | 404 | 409;

  constructor(
    reason: ShopifyLaunchErrorReason,
    statusCode: 400 | 403 | 404 | 409 = 400,
  ) {
    super('The Shopify launch request could not be completed.');
    this.name = 'ShopifyLaunchError';
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

