import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  projectAnalysisDataSchema,
  projectGeneratedListingSchema,
  projectReadinessDataSchema,
  projectSeoDataSchema,
} from '@/modules/projects/validators/project';
import {
  DEFAULT_SHOPIFY_PUBLISH_STATUS,
  mapListingToShopifyProduct,
} from '../publishing/listing-mapping';
import type {
  CoordinatorRepository,
  StoredCoordinatorExecution,
} from '../coordinator/coordinator-repository';
import {
  SHOPIFY_PUBLICATION_STEPS,
} from '../coordinator/coordinator-types';
import { opaqueProjectReference } from '../metafields/metafield-mapping';

const executionInclude = {
  steps: { orderBy: { createdAt: 'asc' as const } },
};

function stored(record: {
  id: string;
  status: StoredCoordinatorExecution['status'];
  triggerType: StoredCoordinatorExecution['triggerType'];
  executionNumber: number;
  startedAt: Date;
  completedAt: Date | null;
  lastHeartbeatAt: Date;
  steps: StoredCoordinatorExecution['steps'];
}): StoredCoordinatorExecution {
  return record;
}

function productInput(project: {
  generatedListing: unknown;
  seoData: unknown;
  analysisData: unknown;
  readinessData: unknown;
  publication: { lastStatus: 'ACTIVE' | 'DRAFT' } | null;
}) {
  const listing = projectGeneratedListingSchema.safeParse(project.generatedListing);
  const seo = projectSeoDataSchema.safeParse(project.seoData);
  const analysis = projectAnalysisDataSchema.safeParse(project.analysisData);
  const readiness = projectReadinessDataSchema.safeParse(project.readinessData);
  if (!listing.success || !seo.success || !analysis.success || !readiness.success) {
    return { input: null, ready: false };
  }
  const input = mapListingToShopifyProduct({
    listing: {
      title: listing.data.title,
      description: listing.data.description,
      tags: seo.data.tags,
    },
    product: { brand: analysis.data.activeProduct.brand },
  }, project.publication?.lastStatus ?? DEFAULT_SHOPIFY_PUBLISH_STATUS);
  return { input, ready: readiness.data.shopifyReady };
}

export const prismaPublicationCoordinatorRepository: CoordinatorRepository = {
  async resolveProject(actorUserId, projectId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        workspace: {
          organization: { memberships: { some: { userId: actorUserId } } },
        },
      },
      select: {
        id: true,
        workspaceId: true,
        version: true,
        updatedAt: true,
        archivedAt: true,
        generatedListing: true,
        seoData: true,
        analysisData: true,
        readinessData: true,
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
          select: { lastStatus: true },
        },
        shopifyVariantConfiguration: {
          select: {
            version: true,
            variants: {
              where: { active: true },
              take: 1,
              select: { id: true },
            },
          },
        },
        shopifyMetafieldConfiguration: {
          select: {
            version: true,
            metafields: {
              where: {
                enabled: true,
                serializedValue: { not: null },
              },
              take: 1,
              select: { id: true },
            },
          },
        },
        shopifyImageConfiguration: {
          select: {
            version: true,
            images: {
              where: { active: true },
              take: 1,
              select: { id: true },
            },
          },
        },
      },
    });
    const membership = project?.workspace.organization.memberships[0];
    if (!project || !membership) return null;
    const store = project.workspace.shopifyStores[0];
    const mapped = productInput({
      ...project,
      publication: project.shopifyProductPublication,
    });
    return {
      actorUserId,
      organizationId: project.workspace.organizationId,
      workspaceId: project.workspaceId,
      projectId: project.id,
      role: membership.role,
      archived: Boolean(project.archivedAt),
      shopifyStoreId: store?.id ?? null,
      connected: Boolean(store),
      productInput: mapped.input,
      applicability: {
        productReady: mapped.ready && Boolean(mapped.input),
        hasVariantConfiguration: Boolean(
          project.shopifyVariantConfiguration?.variants.length,
        ),
        hasEnabledMappedMetafields: Boolean(
          project.shopifyMetafieldConfiguration?.metafields.length,
        ),
        hasActiveImages: Boolean(
          project.shopifyImageConfiguration?.images.length,
        ),
        freshness: {
          PRODUCT: `project:${project.version}:${project.updatedAt.toISOString()}`,
          VARIANTS: `variants:${project.shopifyVariantConfiguration?.version ?? 0}`,
          METAFIELDS: `metafields:${project.shopifyMetafieldConfiguration?.version ?? 0}:project:${project.version}`,
          IMAGES: `images:${project.shopifyImageConfiguration?.version ?? 0}`,
        },
      },
    };
  },

  async latest(context) {
    const result = await prisma.shopifyPublicationExecution.findFirst({
      where: {
        projectId: context.projectId,
        workspaceId: context.workspaceId,
      },
      orderBy: { executionNumber: 'desc' },
      include: executionInclude,
    });
    return result ? stored(result) : null;
  },

  async acquire(input) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const active = await transaction.shopifyPublicationExecution.findUnique({
          where: { activeLeaseProjectId: input.context.projectId },
          include: executionInclude,
        });
        let staleRecovered = false;
        if (active && active.lastHeartbeatAt > input.staleBefore) {
          return {
            execution: stored(active),
            coalesced: true,
            staleRecovered: false,
          };
        }
        if (active) {
          await transaction.shopifyPublicationExecution.update({
            where: { id: active.id },
            data: {
              activeLeaseProjectId: null,
              status: 'PARTIAL',
              completedAt: new Date(),
            },
          });
          staleRecovered = true;
        }
        const latest = await transaction.shopifyPublicationExecution.findFirst({
          where: { projectId: input.context.projectId },
          orderBy: { executionNumber: 'desc' },
          select: { executionNumber: true },
        });
        const execution = await transaction.shopifyPublicationExecution.create({
          data: {
            projectId: input.context.projectId,
            workspaceId: input.context.workspaceId,
            shopifyStoreId: input.context.shopifyStoreId!,
            requestedByUserId: input.context.actorUserId,
            status: 'RUNNING',
            triggerType: input.triggerType,
            executionNumber: (latest?.executionNumber ?? 0) + 1,
            activeLeaseProjectId: input.context.projectId,
            steps: {
              create: SHOPIFY_PUBLICATION_STEPS.map((step) => ({ step })),
            },
          },
          include: executionInclude,
        });
        return {
          execution: stored(execution),
          coalesced: false,
          staleRecovered,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 20_000,
        timeout: 20_000,
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)
        || !['P2002', 'P2034'].includes(error.code)) throw error;
      const active = await prisma.shopifyPublicationExecution.findUnique({
        where: { activeLeaseProjectId: input.context.projectId },
        include: executionInclude,
      });
      if (!active) throw error;
      return {
        execution: stored(active),
        coalesced: true,
        staleRecovered: false,
      };
    }
  },

  async beginStep(executionId, step) {
    const result = await prisma.shopifyPublicationStepExecution.update({
      where: { executionId_step: { executionId, step } },
      data: {
        status: 'RUNNING',
        startedAt: new Date(),
        completedAt: null,
        attemptNumber: { increment: 1 },
      },
      select: { attemptNumber: true },
    });
    await prisma.shopifyPublicationExecution.update({
      where: { id: executionId },
      data: { lastHeartbeatAt: new Date() },
    });
    return result.attemptNumber;
  },

  async finishStep(executionId, result) {
    await prisma.$transaction([
      prisma.shopifyPublicationStepExecution.update({
        where: { executionId_step: { executionId, step: result.step } },
        data: {
          status: result.status,
          completedAt: result.completedAt ? new Date(result.completedAt) : null,
          retryable: result.retryable,
          blocking: result.blocking,
          safeErrorCategory: result.safeErrorCategory,
          safeMessage: result.safeMessage,
          resultSummary: result.counts as Prisma.InputJsonValue,
          freshnessKey: result.freshnessKey,
        },
      }),
      prisma.shopifyPublicationExecution.update({
        where: { id: executionId },
        data: { lastHeartbeatAt: new Date() },
      }),
    ]);
  },

  async completeExecution(executionId, status, completedAt) {
    await prisma.shopifyPublicationExecution.update({
      where: { id: executionId },
      data: {
        status,
        completedAt,
        lastHeartbeatAt: completedAt,
        activeLeaseProjectId: null,
      },
    });
  },

  async audit(input) {
    const counts = Object.fromEntries([
      'SUCCEEDED', 'UNCHANGED', 'SKIPPED', 'PENDING',
      'PARTIAL', 'FAILED', 'BLOCKED',
    ].map((status) => [
      status.toLowerCase(),
      input.steps.filter((step) => step.status === status).length,
    ]));
    await prisma.auditLog.create({
      data: {
        organizationId: input.context.organizationId,
        workspaceId: input.context.workspaceId,
        userId: input.context.actorUserId,
        action: input.action,
        entityType: 'ShopifyPublication',
        entityId: opaqueProjectReference(input.context.projectId),
        metadata: {
          projectReference: opaqueProjectReference(input.context.projectId),
          triggerType: input.triggerType,
          overallStatus: input.status,
          executionNumber: input.executionNumber,
          stepCounts: counts,
          stepStatuses: Object.fromEntries(
            input.steps.map((step) => [step.step, step.status]),
          ),
        },
      },
    });
  },
};
