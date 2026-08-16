import 'server-only';

import {
  Prisma,
  type ProjectSourceType as PrismaProjectSourceType,
  type ProjectStatus as PrismaProjectStatus,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type {
  ProjectAuditWrite,
  ProjectRecord,
  ProjectRepository,
  ProjectRepositoryTransaction,
  ProjectStateWrite,
} from './project-repository';
import type { ProjectSourceType } from '../validators/project';

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null
    ? Prisma.DbNull
    : value as Prisma.InputJsonValue;
}

class PrismaProjectTransaction implements ProjectRepositoryTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async findWorkspaceMembership(userId: string, workspaceId: string) {
    const membership = await this.transaction.membership.findFirst({
      where: {
        userId,
        organization: {
          workspaces: {
            some: {
              id: workspaceId,
            },
          },
        },
      },
      select: {
        role: true,
        organizationId: true,
      },
    });

    return membership;
  }

  async listProjects(workspaceId: string, archived: boolean): Promise<ProjectRecord[]> {
    return this.transaction.project.findMany({
      where: {
        workspaceId,
        archivedAt: archived
          ? { not: null }
          : null,
      },
      orderBy: [
        { updatedAt: 'desc' },
        { id: 'asc' },
      ],
    });
  }

  async findProject(
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectRecord | null> {
    return this.transaction.project.findFirst({
      where: {
        id: projectId,
        workspaceId,
      },
    });
  }

  async createProject(input: {
    workspaceId: string;
    name: string;
    sourceType: ProjectSourceType | null;
    sourceUrl: string | null;
    rawInput: string | null;
  }): Promise<ProjectRecord> {
    return this.transaction.project.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        sourceType: input.sourceType as PrismaProjectSourceType | null,
        sourceUrl: input.sourceUrl,
        rawInput: input.rawInput,
        products: {
          create: {
            workspace: { connect: { id: input.workspaceId } },
            name: input.name,
            sourceType: input.sourceType as PrismaProjectSourceType | null,
            sourceUrl: input.sourceUrl,
            rawInput: input.rawInput,
          },
        },
      },
    });
  }

  async renameProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    name: string;
  }): Promise<ProjectRecord | null> {
    const result = await this.transaction.project.updateMany({
      where: {
        id: input.projectId,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
      },
      data: {
        name: input.name,
        version: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });

    return result.count === 1
      ? this.findProject(input.workspaceId, input.projectId)
      : null;
  }

  async saveProjectState(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    state: ProjectStateWrite;
  }): Promise<ProjectRecord | null> {
    const result = await this.transaction.project.updateMany({
      where: {
        id: input.projectId,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        sourceType: input.state.sourceType as PrismaProjectSourceType | null,
        sourceUrl: input.state.sourceUrl,
        rawInput: input.state.rawInput,
        analysisData: nullableJson(input.state.analysisData),
        generatedListing: nullableJson(input.state.generatedListing),
        seoData: nullableJson(input.state.seoData),
        readinessData: nullableJson(input.state.readinessData),
        status: input.state.status as PrismaProjectStatus,
        version: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });

    return result.count === 1
      ? this.findProject(input.workspaceId, input.projectId)
      : null;
  }

  async archiveProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    previousStatus: 'DRAFT' | 'READY';
  }): Promise<ProjectRecord | null> {
    const result = await this.transaction.project.updateMany({
      where: {
        id: input.projectId,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
        archivedAt: null,
      },
      data: {
        status: 'ARCHIVED',
        statusBeforeArchive: input.previousStatus,
        archivedAt: new Date(),
        version: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });

    return result.count === 1
      ? this.findProject(input.workspaceId, input.projectId)
      : null;
  }

  async restoreProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    restoredStatus: 'DRAFT' | 'READY';
  }): Promise<ProjectRecord | null> {
    const result = await this.transaction.project.updateMany({
      where: {
        id: input.projectId,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
        archivedAt: {
          not: null,
        },
        status: 'ARCHIVED',
      },
      data: {
        status: input.restoredStatus,
        statusBeforeArchive: null,
        archivedAt: null,
        version: {
          increment: 1,
        },
        updatedAt: new Date(),
      },
    });

    return result.count === 1
      ? this.findProject(input.workspaceId, input.projectId)
      : null;
  }

  async deleteProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
  }): Promise<boolean> {
    const result = await this.transaction.project.deleteMany({
      where: {
        id: input.projectId,
        workspaceId: input.workspaceId,
        version: input.expectedVersion,
      },
    });
    return result.count === 1;
  }

  async createAuditEvent(input: ProjectAuditWrite): Promise<void> {
    await this.transaction.auditLog.create({
      data: input,
    });
  }
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'P2034',
  );
}

export class PrismaProjectRepository implements ProjectRepository {
  async transaction<T>(
    operation: (transaction: ProjectRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const maximumAttempts = 3;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        return await prisma.$transaction(
          (transaction) => operation(new PrismaProjectTransaction(transaction)),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 30_000,
            timeout: 15_000,
          },
        );
      } catch (error) {
        if (!isRetryableTransactionConflict(error) || attempt === maximumAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Project transaction retry limit reached.');
  }
}

export const prismaProjectRepository = new PrismaProjectRepository();
