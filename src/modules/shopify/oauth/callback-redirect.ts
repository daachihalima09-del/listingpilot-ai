import type { ShopifyCallbackErrorReason } from '../types/errors.ts';
import {
  tenantAwarePath,
  type TenantRouteContext,
} from '../../tenancy/tenant-route-context.ts';

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
  tenantContext: TenantRouteContext = {},
): URL {
  const url = new URL(tenantAwarePath(
    '/settings/shopify',
    tenantContext,
    { error: reason },
  ), appUrl);
  return url;
}
