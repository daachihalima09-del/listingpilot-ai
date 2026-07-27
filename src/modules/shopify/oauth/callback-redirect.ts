import type { ShopifyCallbackErrorReason } from '../types/errors.ts';

export function shopifyCallbackSuccessUrl(
  appUrl: string,
  safeReturnPath = '/settings/shopify',
): URL {
  const url = new URL(safeReturnPath, appUrl);
  if (url.origin !== new URL(appUrl).origin) {
    return shopifyCallbackSuccessUrl(appUrl);
  }
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
