import type {
  MetafieldCatalogGroup,
  ShopifyMetafieldType,
} from './metafield-catalog.ts';

export interface PersistedProjectMetafield {
  id: string;
  catalogId: string;
  namespace: string;
  key: string;
  type: ShopifyMetafieldType;
  value: string | null;
  valueHash: string | null;
  enabled: boolean;
  shopifyMetafieldId: string | null;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
  lastPublishedHash: string | null;
}

export interface PersistedMetafieldConfiguration {
  id: string;
  schemaVersion: string;
  version: number;
  fields: PersistedProjectMetafield[];
}

export interface ShopifyMetafieldProjectContext {
  actorUserId: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  archived: boolean;
  shopifyStoreId: string | null;
  shopifyProductId: string | null;
  projectData: {
    analysisData: unknown;
    generatedListing: unknown;
    seoData: unknown;
  };
  configuration: PersistedMetafieldConfiguration | null;
}

export interface MetafieldPreviewField {
  catalogId: string;
  group: MetafieldCatalogGroup;
  displayName: string;
  description: string;
  type: ShopifyMetafieldType;
  enabled: boolean;
  hasValue: boolean;
  preview: string | null;
  publicationStatus: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED';
}

export interface ShopifyMetafieldConfigurationDto {
  schemaVersion: string;
  version: number;
  hasMappedData: boolean;
  fields: MetafieldPreviewField[];
  lastPublishedAt: string | null;
  conflicts: Array<{
    catalogId: string;
    displayName: string;
    expectedType: string;
    existingType: string;
  }>;
}

export interface ShopifyMetafieldRepository {
  resolveProject(
    actorUserId: string,
    projectId: string,
  ): Promise<ShopifyMetafieldProjectContext | null>;
  saveConfiguration(input: {
    context: ShopifyMetafieldProjectContext;
    version: number;
    fields: Array<{
      catalogId: string;
      namespace: string;
      key: string;
      type: ShopifyMetafieldType;
      value: string | null;
      valueHash: string | null;
      enabled: boolean;
    }>;
  }): Promise<boolean>;
  refreshMappedValues(input: {
    configurationId: string;
    fields: Array<{
      catalogId: string;
      value: string | null;
      valueHash: string | null;
    }>;
  }): Promise<void>;
  persistDefinition(input: {
    shopifyStoreId: string;
    catalogId: string;
    namespace: string;
    key: string;
    type: string;
    shopifyDefinitionId: string;
  }): Promise<void>;
  persistPublished(input: {
    configurationId: string;
    publishedAt: Date;
    fields: Array<{
      catalogId: string;
      shopifyMetafieldId: string;
      valueHash: string;
    }>;
  }): Promise<void>;
  createAudit(input: {
    context: ShopifyMetafieldProjectContext;
    action:
      | 'shopify.metafield_definitions_created'
      | 'shopify.metafields_created'
      | 'shopify.metafields_updated'
      | 'shopify.metafields_publish_unchanged'
      | 'shopify.metafields_publish_partial'
      | 'shopify.metafield_definition_conflict';
    metadata: {
      catalogIds: string[];
      created: number;
      updated: number;
      unchanged: number;
      conflicted: number;
      batchCount: number;
      failureCategory?: string;
    };
  }): Promise<void>;
}

