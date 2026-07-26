export type ShopifyMetafieldViewState =
  | 'CONFIGURATION_MISSING'
  | 'NOT_CONNECTED'
  | 'PRODUCT_NOT_PUBLISHED'
  | 'READ_ONLY'
  | 'NO_MAPPED_DATA'
  | 'READY';

export function getShopifyMetafieldViewState(input: {
  configured: boolean;
  connected: boolean;
  hasPublishedProduct: boolean;
  canManage: boolean;
  hasMappedData: boolean;
}): ShopifyMetafieldViewState {
  if (!input.configured) return 'CONFIGURATION_MISSING';
  if (!input.connected) return 'NOT_CONNECTED';
  if (!input.hasPublishedProduct) return 'PRODUCT_NOT_PUBLISHED';
  if (!input.canManage) return 'READ_ONLY';
  if (!input.hasMappedData) return 'NO_MAPPED_DATA';
  return 'READY';
}

