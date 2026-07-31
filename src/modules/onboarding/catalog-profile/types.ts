export type MerchantCatalogSetupMode = 'SHOPIFY_IMPORT' | 'MANUAL';

export type MerchantCatalogEntryKind =
  | 'COLLECTION'
  | 'PRODUCT_TYPE'
  | 'VENDOR';

export interface MerchantCatalogProfileValues {
  collections: string[];
  productTypes: string[];
  vendors: string[];
}

export interface MerchantCatalogProfileDto
  extends MerchantCatalogProfileValues {
  id: string;
  workspaceId: string;
  setupMode: MerchantCatalogSetupMode;
  version: number;
  completedAt: string;
  updatedAt: string;
}

export interface MerchantCatalogProfileRecord {
  id: string;
  workspaceId: string;
  setupMode: MerchantCatalogSetupMode;
  version: number;
  completedAt: Date;
  updatedAt: Date;
  entries: Array<{
    kind: MerchantCatalogEntryKind;
    value: string;
    normalizedValue: string;
    position: number;
  }>;
}
