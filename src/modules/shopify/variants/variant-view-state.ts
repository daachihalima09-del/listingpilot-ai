export type ShopifyVariantViewState =
  | 'CONFIGURATION_MISSING'
  | 'NOT_CONNECTED'
  | 'PRODUCT_NOT_PUBLISHED'
  | 'READ_ONLY'
  | 'READY';

export function getShopifyVariantViewState(input: {
  configured: boolean;
  connected: boolean;
  hasPublishedProduct: boolean;
  canManage: boolean;
}): ShopifyVariantViewState {
  if (!input.configured) return 'CONFIGURATION_MISSING';
  if (!input.connected) return 'NOT_CONNECTED';
  if (!input.hasPublishedProduct) return 'PRODUCT_NOT_PUBLISHED';
  if (!input.canManage) return 'READ_ONLY';
  return 'READY';
}
