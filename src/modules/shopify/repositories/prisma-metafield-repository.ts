import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  SHOPIFY_METAFIELD_CATALOG_VERSION,
  type ShopifyMetafieldType,
} from '../metafields/metafield-catalog';
import type {
  PersistedMetafieldConfiguration,
  ShopifyMetafieldRepository,
} from '../metafields/metafield-repository';
import { opaqueProjectReference } from '../metafields/metafield-mapping';
import {
  isShopifyMetafieldType,
  validateCatalogIdentity,
} from '../metafields/metafield-validation';

const configurationInclude = {
  metafields: {
    orderBy: { catalogKey: 'asc' as const },
  },
};

function configuration(record: {
  id: string;
  schemaVersion: string;
  version: number;
  metafields: Array<{
    id: string;
    catalogKey: string;
    namespace: string;
    key: string;
    type: string;
    serializedValue: string | null;
    valueHash: string | null;
    enabled: boolean;
    shopifyMetafieldId: string | null;
    firstPublishedAt: Date | null;
    lastPublishedAt: Date | null;
    lastPublishedHash: string | null;
  }>;
}): PersistedMetafieldConfiguration {
  return {
    id: record.id,
    schemaVersion: record.schemaVersion,
    version: record.version,
    fields: record.metafields.map((field) => {
      validateCatalogIdentity({
        catalogId: field.catalogKey,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
      });
      if (!isShopifyMetafieldType(field.type)) {
        throw new Error('Unsupported stored metafield type.');
      }
      return {
        id: field.id,
        catalogId: field.catalogKey,
        namespace: field.namespace,
        key: field.key,
        type: field.type as ShopifyMetafieldType,
        value: field.serializedValue,
        valueHash: field.valueHash,
        enabled: field.enabled,
        shopifyMetafieldId: field.shopifyMetafieldId,
        firstPublishedAt: field.firstPublishedAt,
        lastPublishedAt: field.lastPublishedAt,
        lastPublishedHash: field.lastPublishedHash,
      };
    }),
  };
}

export const prismaShopifyMetafieldRepository: ShopifyMetafieldRepository = {
  async resolveProject(actorUserId, projectId) {
    const project = await prisma.product.findFirst({
      where: {
        id: projectId,
        workspace: {
          organization: {
            memberships: { some: { userId: actorUserId } },
          },
        },
      },
      select: {
        id: true,
        workspaceId: true,
        archivedAt: true,
        analysisData: true,
        generatedListing: true,
        seoData: true,
        workspace: {
          select: {
            organizationId: true,
            organization: {
              select: {
                memberships: {
                  where: { userId: actorUserId },
                  take: 1,
                  select: { role: true },
                },
              },
            },
            shopifyStores: {
              where: {
                status: { in: ['CONNECTED', 'ACTIVE'] },
                accessTokenEncrypted: { not: null },
              },
              take: 1,
              select: { id: true },
            },
          },
        },
        shopifyProductPublication: {
          select: { shopifyProductId: true },
        },
        shopifyMetafieldConfiguration: {
          include: configurationInclude,
        },
      },
    });
    const membership = project?.workspace.organization.memberships[0];
    if (!project || !membership) return null;
    return {
      actorUserId,
      organizationId: project.workspace.organizationId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      role: membership.role,
      archived: Boolean(project.archivedAt),
      shopifyStoreId: project.workspace.shopifyStores[0]?.id ?? null,
      shopifyProductId:
        project.shopifyProductPublication?.shopifyProductId ?? null,
      projectData: {
        analysisData: project.analysisData,
        generatedListing: project.generatedListing,
        seoData: project.seoData,
      },
      configuration: project.shopifyMetafieldConfiguration
        ? configuration(project.shopifyMetafieldConfiguration)
        : null,
    };
  },

  async saveConfiguration(input) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.shopifyMetafieldConfiguration.findFirst({
        where: {
          workspaceId: input.context.workspaceId,
          productId: input.context.projectId,
        },
      });
      if ((existing?.version ?? 0) !== input.version) return false;
      const header = existing
        ? await transaction.shopifyMetafieldConfiguration.update({
            where: { id: existing.id },
            data: {
              schemaVersion: SHOPIFY_METAFIELD_CATALOG_VERSION,
              version: { increment: 1 },
            },
          })
        : await transaction.shopifyMetafieldConfiguration.create({
            data: {
              workspaceId: input.context.workspaceId,
              productId: input.context.projectId,
              projectId: (await transaction.product.findUniqueOrThrow({ where: { id: input.context.projectId }, select: { projectId: true } })).projectId,
              schemaVersion: SHOPIFY_METAFIELD_CATALOG_VERSION,
            },
          });
      for (const field of input.fields) {
        await transaction.shopifyProjectMetafield.upsert({
          where: {
            configurationId_catalogKey: {
              configurationId: header.id,
              catalogKey: field.catalogId,
            },
          },
          create: {
            configurationId: header.id,
            catalogKey: field.catalogId,
            namespace: field.namespace,
            key: field.key,
            type: field.type,
            serializedValue: field.value,
            valueHash: field.valueHash,
            enabled: field.enabled,
          },
          update: {
            namespace: field.namespace,
            key: field.key,
            type: field.type,
            serializedValue: field.value,
            valueHash: field.valueHash,
            enabled: field.enabled,
          },
        });
      }
      return true;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 20_000,
    });
  },

  async refreshMappedValues(input) {
    await prisma.$transaction(input.fields.map((field) => (
      prisma.shopifyProjectMetafield.updateMany({
        where: {
          configurationId: input.configurationId,
          catalogKey: field.catalogId,
        },
        data: {
          serializedValue: field.value,
          valueHash: field.valueHash,
        },
      })
    )));
  },

  async persistDefinition(input) {
    await prisma.shopifyMetafieldDefinitionLink.upsert({
      where: {
        shopifyStoreId_catalogKey: {
          shopifyStoreId: input.shopifyStoreId,
          catalogKey: input.catalogId,
        },
      },
      create: {
        shopifyStoreId: input.shopifyStoreId,
        catalogKey: input.catalogId,
        namespace: input.namespace,
        key: input.key,
        type: input.type,
        shopifyDefinitionId: input.shopifyDefinitionId,
      },
      update: {
        namespace: input.namespace,
        key: input.key,
        type: input.type,
        shopifyDefinitionId: input.shopifyDefinitionId,
      },
    });
  },

  async persistPublished(input) {
    await prisma.$transaction(async (transaction) => {
      for (const field of input.fields) {
        const existing = await transaction.shopifyProjectMetafield.findFirst({
          where: {
            configurationId: input.configurationId,
            catalogKey: field.catalogId,
          },
          select: { id: true, firstPublishedAt: true },
        });
        if (!existing) throw new Error('Metafield linkage was not found.');
        await transaction.shopifyProjectMetafield.update({
          where: { id: existing.id },
          data: {
            shopifyMetafieldId: field.shopifyMetafieldId,
            firstPublishedAt: existing.firstPublishedAt ?? input.publishedAt,
            lastPublishedAt: input.publishedAt,
            lastPublishedHash: field.valueHash,
          },
        });
      }
    });
  },

  async createAudit(input) {
    if (!input.context.shopifyProductId) {
      throw new Error('A linked Shopify product is required.');
    }
    await prisma.auditLog.create({
      data: {
        organizationId: input.context.organizationId,
        workspaceId: input.context.workspaceId,
        userId: input.context.actorUserId,
        action: input.action,
        entityType: 'ShopifyProduct',
        entityId: input.context.shopifyProductId,
        metadata: {
          projectReference: opaqueProjectReference(input.context.projectId),
          shopifyProductId: input.context.shopifyProductId,
          schemaVersion: SHOPIFY_METAFIELD_CATALOG_VERSION,
          catalogIds: input.metadata.catalogIds,
          created: input.metadata.created,
          updated: input.metadata.updated,
          unchanged: input.metadata.unchanged,
          conflicted: input.metadata.conflicted,
          batchCount: input.metadata.batchCount,
          ...(input.metadata.failureCategory
            ? { failureCategory: input.metadata.failureCategory }
            : {}),
        },
      },
    });
  },
};
