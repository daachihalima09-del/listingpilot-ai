import type {
  ShopifyVariantConfigurationDto,
  ShopifyVariantConfigurationInput,
} from './variant-validation.ts';

export interface PersistedShopifyVariant {
  id: string;
  shopifyVariantId: string | null;
  combinationKey: string;
  optionValues: Array<{ name: string; value: string }>;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
  position: number;
  active: boolean;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
}

export interface PersistedShopifyVariantConfiguration {
  id: string;
  version: number;
  options: Array<{ name: string; values: string[] }>;
  variants: PersistedShopifyVariant[];
}

export interface ShopifyVariantProjectContext {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  archived: boolean;
  shopifyProductId: string | null;
  configuration: PersistedShopifyVariantConfiguration | null;
}

export interface ShopifyVariantRepository {
  resolveProject(
    actorUserId: string,
    projectId: string,
  ): Promise<ShopifyVariantProjectContext | null>;
  getDto(
    workspaceId: string,
    projectId: string,
  ): Promise<ShopifyVariantConfigurationDto>;
  saveConfiguration(input: {
    workspaceId: string;
    projectId: string;
    configuration: ShopifyVariantConfigurationInput;
  }): Promise<ShopifyVariantConfigurationDto | null>;
  linkVariant(input: {
    workspaceId: string;
    projectId: string;
    localVariantId: string;
    shopifyVariantId: string;
    publishedAt: Date;
  }): Promise<void>;
  touchVariants(input: {
    workspaceId: string;
    projectId: string;
    localVariantIds: string[];
    publishedAt: Date;
  }): Promise<void>;
  createAudit(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    projectId: string;
    shopifyProductId: string;
    action:
      | 'shopify.variants_created'
      | 'shopify.variants_updated'
      | 'shopify.variant_publish_partial';
    metadata: {
      created: number;
      updated: number;
      unchanged: number;
      localVariantIds: string[];
      failureCategory?: string;
    };
  }): Promise<void>;
}
