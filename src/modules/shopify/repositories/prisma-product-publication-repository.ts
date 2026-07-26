import 'server-only';

import { prisma } from '@/lib/prisma';
import type {
  ShopifyProductPublicationRepository,
} from '../publishing/publication-repository';
import type {
  ShopifyPublishedProductReference,
} from '../publishing/publication-types';

function toReference(record: {
  shopifyProductId: string;
  shopifyTitle: string;
  shopifyHandle: string | null;
  lastStatus: 'ACTIVE' | 'DRAFT';
  firstPublishedAt: Date;
  lastPublishedAt: Date;
}): ShopifyPublishedProductReference {
  return {
    id: record.shopifyProductId,
    title: record.shopifyTitle,
    handle: record.shopifyHandle,
    status: record.lastStatus,
    firstPublishedAt: record.firstPublishedAt.toISOString(),
    lastPublishedAt: record.lastPublishedAt.toISOString(),
  };
}

function publicationCreateData(input: {
  projectId: string;
  workspaceId: string;
  product: {
    id: string;
    title: string;
    handle: string;
    status: 'ACTIVE' | 'DRAFT';
  };
  publishedAt: Date;
}) {
  return {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    shopifyProductId: input.product.id,
    shopifyHandle: input.product.handle,
    shopifyTitle: input.product.title,
    lastStatus: input.product.status,
    firstPublishedAt: input.publishedAt,
    lastPublishedAt: input.publishedAt,
  };
}

function publicationUpdateData(input: {
  workspaceId: string;
  product: {
    id: string;
    title: string;
    handle: string;
    status: 'ACTIVE' | 'DRAFT';
  };
  publishedAt: Date;
}) {
  return {
    workspaceId: input.workspaceId,
    shopifyProductId: input.product.id,
    shopifyHandle: input.product.handle,
    shopifyTitle: input.product.title,
    lastStatus: input.product.status,
    lastPublishedAt: input.publishedAt,
  };
}

export const prismaShopifyProductPublicationRepository:
ShopifyProductPublicationRepository = {
  async resolveProject(actorUserId, projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        archivedAt: null,
        workspace: {
          organization: {
            memberships: {
              some: { userId: actorUserId },
            },
          },
        },
      },
      select: {
        id: true,
        workspaceId: true,
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
        shopifyProductPublication: true,
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
      publication: project.shopifyProductPublication
        ? toReference(project.shopifyProductPublication)
        : null,
    };
  },

  async findForProject(workspaceId, projectId) {
    const publication = await prisma.shopifyProductPublication.findFirst({
      where: { workspaceId, projectId },
    });
    return publication ? toReference(publication) : null;
  },

  async save({ workspaceId, projectId, product, publishedAt }) {
    const publication = await prisma.shopifyProductPublication.upsert({
      where: {
        projectId_workspaceId: {
          projectId,
          workspaceId,
        },
      },
      create: publicationCreateData({
        projectId,
        workspaceId,
        product,
        publishedAt,
      }),
      update: publicationUpdateData({
        workspaceId,
        product,
        publishedAt,
      }),
    });
    return toReference(publication);
  },

  async saveCreated(input) {
    return prisma.$transaction(async (transaction) => {
      const publication = await transaction.shopifyProductPublication.upsert({
        where: {
          projectId_workspaceId: {
            projectId: input.projectId,
            workspaceId: input.workspaceId,
          },
        },
        create: publicationCreateData(input),
        update: publicationUpdateData(input),
      });
      await transaction.auditLog.create({
        data: {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
          userId: input.actorUserId,
          action: 'shopify.product_created',
          entityType: 'ShopifyProduct',
          entityId: input.product.id,
          metadata: {
            shopifyProductId: input.product.id,
            title: input.product.title,
            handle: input.product.handle,
            status: input.product.status,
            projectId: input.projectId,
          },
        },
      });
      return toReference(publication);
    });
  },
};
