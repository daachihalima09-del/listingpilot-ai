import type { ShopifyProductSnapshot } from './snapshot.ts';

export interface ShopifyImportedProject {
  projectId: string;
  archived: boolean;
  state: 'VALID_EXISTING_LINK' | 'LEGACY_RECOVERABLE_LINK' | 'RECOVERABLE_LINK_REPAIRED' | 'ARCHIVED_EXISTING_PROJECT' | 'INCONSISTENT_LINK_BLOCKED';
}

export interface ShopifyImportRepository {
  findExisting(input: {
    workspaceId: string;
    shopifyStoreId: string;
    productGid: string;
  }): Promise<ShopifyImportedProject | null>;
  repairLegacy(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    shopifyStoreId: string;
    snapshot: ShopifyProductSnapshot;
    repairedAt: Date;
  }): Promise<ShopifyImportedProject>;
  create(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    shopifyStoreId: string;
    shopDomain: string;
    snapshot: ShopifyProductSnapshot;
    importedAt: Date;
  }): Promise<ShopifyImportedProject>;
}
