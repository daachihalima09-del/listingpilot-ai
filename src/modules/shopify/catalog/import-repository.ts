import type { ShopifyProductSnapshot } from './snapshot.ts';

export interface ShopifyImportedProject {
  projectId: string;
  archived: boolean;
}

export interface ShopifyImportRepository {
  findExisting(input: {
    workspaceId: string;
    shopifyStoreId: string;
    productGid: string;
  }): Promise<ShopifyImportedProject | null>;
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

