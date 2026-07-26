export interface ShopifyPublishedProductReference {
  id: string;
  title: string;
  handle: string | null;
  status: 'ACTIVE' | 'DRAFT';
  firstPublishedAt: string;
  lastPublishedAt: string;
}

export type ShopifyPublishingAvailability =
  | 'CONFIGURATION_MISSING'
  | 'NOT_CONNECTED'
  | 'READ_ONLY'
  | 'READY'
  | 'PUBLISHED';

export interface ShopifyPublishingContext {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  publication: ShopifyPublishedProductReference | null;
  adminUrl: string | null;
}
