import type { ZodType } from 'zod';
import type {
  ProjectRecord,
  ProjectRepository,
  ProjectRepositoryTransaction,
  WorkspaceProjectMembership,
} from '../repositories/project-repository.ts';
import {
  ProjectForbiddenError,
  ProjectLifecycleError,
  ProjectNotFoundError,
  ProjectStaleWriteError,
} from '../types/errors.ts';
import {
  createProjectSchema,
  getProjectSchema,
  listProjectsSchema,
  projectAnalysisDataSchema,
  projectGeneratedListingSchema,
  projectLifecycleSchema,
  projectReadinessDataSchema,
  projectSeoDataSchema,
  renameProjectSchema,
  saveProjectStateSchema,
  type ProjectAnalysisData,
  type ProjectGeneratedListing,
  type ProjectReadinessData,
  type ProjectSeoData,
} from '../validators/project.ts';

export interface ProjectSummary {
  id: string;
  workspaceId: string;
  name: string;
  status: 'DRAFT' | 'READY' | 'ARCHIVED';
  sourceType:
    | 'RAW_SPECIFICATIONS'
    | 'SUPPLIER_URL'
    | 'PRODUCT_URL'
    | 'UPLOADED_PDF'
    | 'SHOPIFY_IMPORT'
    | null;
  sourceUrl: string | null;
  readiness: {
    shopifyReady: boolean;
    score: number | null;
  } | null;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDetail extends ProjectSummary {
  rawInput: string | null;
  analysisData: ProjectAnalysisData | null;
  generatedListing: ProjectGeneratedListing | null;
  seoData: ProjectSeoData | null;
  readinessData: ProjectReadinessData | null;
}

function parseStoredJson<T>(
  schema: ZodType<T>,
  value: unknown,
  fieldName: string,
): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Stored project ${fieldName} is invalid.`);
  }
  return result.data;
}

function toProjectDetail(record: ProjectRecord): ProjectDetail {
  const analysisData = parseStoredJson(
    projectAnalysisDataSchema,
    record.analysisData,
    'analysis data',
  );
  const readinessData = parseStoredJson(
    projectReadinessDataSchema,
    record.readinessData,
    'readiness data',
  );

  return {
    id: record.id,
    workspaceId: record.workspaceId,
    name: record.name,
    status: record.status,
    sourceType: record.sourceType,
    sourceUrl: record.sourceUrl,
    readiness: readinessData
      ? {
          shopifyReady: readinessData.shopifyReady,
          score: analysisData?.activeProduct.catalogHealth.score ?? null,
        }
      : null,
    version: record.version,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    rawInput: record.rawInput,
    analysisData,
    generatedListing: parseStoredJson(
      projectGeneratedListingSchema,
      record.generatedListing,
      'generated listing',
    ),
    seoData: parseStoredJson(projectSeoDataSchema, record.seoData, 'SEO data'),
    readinessData,
  };
}

async function requireWorkspaceMembership(
  transaction: ProjectRepositoryTransaction,
  actorUserId: string,
  workspaceId: string,
): Promise<WorkspaceProjectMembership> {
  const membership = await transaction.findWorkspaceMembership(
    actorUserId,
    workspaceId,
  );
  if (!membership) {
    throw new ProjectNotFoundError();
  }
  return membership;
}

function requireOwner(membership: WorkspaceProjectMembership): void {
  if (membership.role !== 'OWNER') {
    throw new ProjectForbiddenError();
  }
}

async function requireTenantProject(
  transaction: ProjectRepositoryTransaction,
  workspaceId: string,
  projectId: string,
): Promise<ProjectRecord> {
  const project = await transaction.findProject(workspaceId, projectId);
  if (!project) {
    throw new ProjectNotFoundError();
  }
  return project;
}

export async function listProjects(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectSummary[]> {
  const input = listProjectsSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    const projects = await transaction.listProjects(
      input.workspaceId,
      input.archived,
    );
    return projects.map(toProjectDetail);
  });
}

export async function getProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = getProjectSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    return toProjectDetail(
      await requireTenantProject(
        transaction,
        input.workspaceId,
        input.projectId,
      ),
    );
  });
}

export async function createProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = createProjectSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);

    const project = await transaction.createProject(input);
    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.created',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
      },
    });
    return toProjectDetail(project);
  });
}

export async function renameProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = renameProjectSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);
    await requireTenantProject(transaction, input.workspaceId, input.projectId);

    const project = await transaction.renameProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      expectedVersion: input.version,
      name: input.name,
    });
    if (!project) {
      throw new ProjectStaleWriteError();
    }

    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.updated',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
        changedFields: ['name'],
      },
    });
    return toProjectDetail(project);
  });
}

export async function saveProjectState(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = saveProjectStateSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);
    const existingProject = await requireTenantProject(
      transaction,
      input.workspaceId,
      input.projectId,
    );
    if (existingProject.archivedAt) {
      throw new ProjectLifecycleError('Restore this project before saving changes.');
    }

    const project = await transaction.saveProjectState({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      expectedVersion: input.version,
      state: {
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl,
        rawInput: input.rawInput,
        analysisData: input.analysisData,
        generatedListing: input.generatedListing,
        seoData: input.seoData,
        readinessData: input.readinessData,
        status: input.readinessData?.shopifyReady ? 'READY' : 'DRAFT',
      },
    });
    if (!project) {
      throw new ProjectStaleWriteError();
    }

    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.updated',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
        changedFields: [
          'source',
          'analysisData',
          'generatedListing',
          'seoData',
          'readinessData',
        ],
      },
    });
    return toProjectDetail(project);
  });
}

export async function archiveProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = projectLifecycleSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);
    const existingProject = await requireTenantProject(
      transaction,
      input.workspaceId,
      input.projectId,
    );
    if (existingProject.status === 'ARCHIVED' || existingProject.archivedAt) {
      throw new ProjectLifecycleError('This project is already archived.');
    }

    const project = await transaction.archiveProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      expectedVersion: input.version,
      previousStatus: existingProject.status,
    });
    if (!project) {
      throw new ProjectStaleWriteError();
    }

    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.archived',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
        changedFields: ['status', 'archivedAt'],
      },
    });
    return toProjectDetail(project);
  });
}

export async function restoreProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<ProjectDetail> {
  const input = projectLifecycleSchema.parse(untrustedInput);

  return repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);
    const existingProject = await requireTenantProject(
      transaction,
      input.workspaceId,
      input.projectId,
    );
    if (existingProject.status !== 'ARCHIVED' || !existingProject.archivedAt) {
      throw new ProjectLifecycleError('This project is not archived.');
    }

    const project = await transaction.restoreProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      expectedVersion: input.version,
      restoredStatus: existingProject.statusBeforeArchive === 'READY'
        ? 'READY'
        : 'DRAFT',
    });
    if (!project) {
      throw new ProjectStaleWriteError();
    }

    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.restored',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
        changedFields: ['status', 'archivedAt'],
      },
    });
    return toProjectDetail(project);
  });
}

export async function deleteProject(
  repository: ProjectRepository,
  actorUserId: string,
  untrustedInput: unknown,
): Promise<void> {
  const input = projectLifecycleSchema.parse(untrustedInput);

  await repository.transaction(async (transaction) => {
    const membership = await requireWorkspaceMembership(
      transaction,
      actorUserId,
      input.workspaceId,
    );
    requireOwner(membership);
    const project = await requireTenantProject(
      transaction,
      input.workspaceId,
      input.projectId,
    );
    if (project.version !== input.version) {
      throw new ProjectStaleWriteError();
    }

    await transaction.createAuditEvent({
      organizationId: membership.organizationId,
      workspaceId: input.workspaceId,
      userId: actorUserId,
      action: 'project.deleted',
      entityType: 'Project',
      entityId: project.id,
      metadata: {
        workspaceId: input.workspaceId,
      },
    });

    const deleted = await transaction.deleteProject({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      expectedVersion: input.version,
    });
    if (!deleted) {
      throw new ProjectStaleWriteError();
    }
  });
}
