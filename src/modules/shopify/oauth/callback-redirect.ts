import type { ShopifyCallbackErrorReason } from '../types/errors.ts';

export function shopifyCallbackSuccessUrl(appUrl: string): URL {
  const url = new URL('/settings/shopify', appUrl);
  url.searchParams.set('status', 'connected');
  return url;
}

export function shopifyCallbackErrorUrl(
  appUrl: string,
  reason: ShopifyCallbackErrorReason,
): URL {
  const url = new URL('/settings/shopify', appUrl);
  url.searchParams.set('error', reason);
  return url;
}
