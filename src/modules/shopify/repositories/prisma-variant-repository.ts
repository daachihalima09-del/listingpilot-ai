import 'server-only';

import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type {
  PersistedShopifyVariant,
  PersistedShopifyVariantConfiguration,
  ShopifyVariantRepository,
} from '../variants/variant-repository';
import type {
  ShopifyVariantConfigurationDto,
} from '../variants/variant-validation';

const storedOptionValuesSchema = z.array(z.object({
  name: z.string(),
  value: z.string(),
}).strict()).max(3);

function parseVariant(record: {
  id: string;
  shopifyVariantId: string | null;
  combinationKey: string;
  optionValues: unknown;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  barcode: string | null;
  position: number;
  active: boolean;
  firstPublishedAt: Date | null;
  lastPublishedAt: Date | null;
}): PersistedShopifyVariant {
  return {
    ...record,
    optionValues: storedOptionValuesSchema.parse(record.optionValues),
  };
}

function parseConfiguration(record: {
  id: string;
  version: number;
  options: Array<{
    name: string;
    values: Array<{ value: string }>;
  }>;
  variants: Array<Parameters<typeof parseVariant>[0]>;
}): PersistedShopifyVariantConfiguration {
  return {
    id: record.id,
    version: record.version,
    options: record.options.map((option) => ({
      name: option.name,
      values: option.values.map(({ value }) => value),
    })),
    variants: record.variants.map(parseVariant),
  };
}

function toDto(
  configuration: PersistedShopifyVariantConfiguration | null,
): ShopifyVariantConfigurationDto {
  if (!configuration) {
    return {
      version: 0,
      options: [],
      variants: [{
        optionValues: [],
        price: '0.00',
        compareAtPrice: null,
        sku: null,
        barcode: null,
        published: false,
        firstPublishedAt: null,
        lastPublishedAt: null,
      }],
    };
  }
  return {
    version: configuration.version,
    options: configuration.options,
    variants: configuration.variants
      .filter(({ active }) => active)
      .sort((left, right) => left.position - right.position)
      .map((variant) => ({
        optionValues: variant.optionValues,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice,
        sku: variant.sku,
        barcode: variant.barcode,
        published: Boolean(variant.shopifyVariantId),
        firstPublishedAt: variant.firstPublishedAt?.toISOString() ?? null,
        lastPublishedAt: variant.lastPublishedAt?.toISOString() ?? null,
      })),
  };
}

const configurationInclude = {
  options: {
    orderBy: { position: 'asc' as const },
    include: {
      values: {
        orderBy: { position: 'asc' as const },
      },
    },
  },
  variants: {
    orderBy: { position: 'asc' as const },
  },
};

export const prismaShopifyVariantRepository: ShopifyVariantRepository = {
  async resolveProject(actorUserId, projectId) {
    const project = await prisma.project.findFirst({
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
          },
        },
        shopifyProductPublication: {
          select: { shopifyProductId: true },
        },
        shopifyVariantConfiguration: {
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
      shopifyProductId:
        project.shopifyProductPublication?.shopifyProductId ?? null,
      configuration: project.shopifyVariantConfiguration
        ? parseConfiguration(project.shopifyVariantConfiguration)
        : null,
    };
  },

  async getDto(workspaceId, projectId) {
    const configuration = await prisma.shopifyVariantConfiguration.findFirst({
      where: { workspaceId, projectId },
      include: configurationInclude,
    });
    return toDto(configuration ? parseConfiguration(configuration) : null);
  },

  async saveConfiguration({ workspaceId, projectId, configuration }) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.shopifyVariantConfiguration.findFirst({
        where: { workspaceId, projectId },
      });
      if ((existing?.version ?? 0) !== configuration.version) return null;

      const header = existing
        ? await transaction.shopifyVariantConfiguration.update({
            where: { id: existing.id },
            data: { version: { increment: 1 } },
          })
        : await transaction.shopifyVariantConfiguration.create({
            data: { workspaceId, projectId },
          });

      await transaction.shopifyProjectOption.deleteMany({
        where: { configurationId: header.id },
      });
      for (const [optionIndex, option] of configuration.options.entries()) {
        await transaction.shopifyProjectOption.create({
          data: {
            configurationId: header.id,
            name: option.name,
            position: optionIndex,
            values: {
              create: option.values.map((value, position) => ({
                value,
                position,
              })),
            },
          },
        });
      }

      await transaction.shopifyProjectVariant.updateMany({
        where: { configurationId: header.id },
        data: { active: false },
      });
      for (const [position, variant] of configuration.variants.entries()) {
        await transaction.shopifyProjectVariant.upsert({
          where: {
            configurationId_combinationKey: {
              configurationId: header.id,
              combinationKey: variant.combinationKey,
            },
          },
          create: {
            configurationId: header.id,
            combinationKey: variant.combinationKey,
            optionValues: variant.optionValues as Prisma.InputJsonValue,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            sku: variant.sku,
            barcode: variant.barcode,
            position,
            active: true,
          },
          update: {
            optionValues: variant.optionValues as Prisma.InputJsonValue,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            sku: variant.sku,
            barcode: variant.barcode,
            position,
            active: true,
          },
        });
      }

      const saved = await transaction.shopifyVariantConfiguration.findUnique({
        where: { id: header.id },
        include: configurationInclude,
      });
      return toDto(saved ? parseConfiguration(saved) : null);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 30_000,
      timeout: 20_000,
    });
  },

  async linkVariant(input) {
    const result = await prisma.shopifyProjectVariant.updateMany({
      where: {
        id: input.localVariantId,
        configuration: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
      },
      data: {
        shopifyVariantId: input.shopifyVariantId,
        firstPublishedAt: input.publishedAt,
        lastPublishedAt: input.publishedAt,
      },
    });
    if (result.count !== 1) throw new Error('Variant linkage was not saved.');
  },

  async touchVariants(input) {
    if (input.localVariantIds.length === 0) return;
    await prisma.shopifyProjectVariant.updateMany({
      where: {
        id: { in: input.localVariantIds },
        configuration: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
      },
      data: { lastPublishedAt: input.publishedAt },
    });
  },

  async createAudit(input) {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        workspaceId: input.workspaceId,
        userId: input.actorUserId,
        action: input.action,
        entityType: 'ShopifyProduct',
        entityId: input.shopifyProductId,
        metadata: {
          projectId: input.projectId,
          shopifyProductId: input.shopifyProductId,
          created: input.metadata.created,
          updated: input.metadata.updated,
          unchanged: input.metadata.unchanged,
          localVariantIds: input.metadata.localVariantIds,
          ...(input.metadata.failureCategory
            ? { failureCategory: input.metadata.failureCategory }
            : {}),
        },
      },
    });
  },
};
