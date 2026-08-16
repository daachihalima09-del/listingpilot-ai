import type {
  ProjectAnalysisData,
  ProjectGeneratedListing,
  ProjectReadinessData,
  ProjectSeoData,
  ProjectSourceType,
  ProjectStatus,
} from '../validators/project.ts';

export interface WorkspaceProjectMembership {
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  name: string;
  defaultProductType: string | null;
  defaultCollection: string | null;
  status: ProjectStatus;
  statusBeforeArchive: ProjectStatus | null;
  sourceType: ProjectSourceType | null;
  sourceUrl: string | null;
  rawInput: string | null;
  analysisData: unknown;
  generatedListing: unknown;
  seoData: unknown;
  readinessData: unknown;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectStateWrite {
  sourceType: ProjectSourceType | null;
  sourceUrl: string | null;
  rawInput: string | null;
  analysisData: ProjectAnalysisData | null;
  generatedListing: ProjectGeneratedListing | null;
  seoData: ProjectSeoData | null;
  readinessData: ProjectReadinessData | null;
  status: Exclude<ProjectStatus, 'ARCHIVED'>;
}

export interface ProjectAuditWrite {
  organizationId: string;
  workspaceId: string;
  userId: string;
  action:
    | 'project.created'
    | 'project.updated'
    | 'project.archived'
    | 'project.restored'
    | 'project.deleted';
  entityType: 'Project';
  entityId: string;
  metadata: {
    workspaceId: string;
    changedFields?: string[];
  };
}

export interface ProjectRepositoryTransaction {
  findWorkspaceMembership(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceProjectMembership | null>;
  listProjects(workspaceId: string, archived: boolean): Promise<ProjectRecord[]>;
  findProject(workspaceId: string, projectId: string): Promise<ProjectRecord | null>;
  createProject(input: {
    workspaceId: string;
    name: string;
    defaultProductType: string | null;
    defaultCollection: string | null;
  }): Promise<ProjectRecord>;
  renameProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    name: string;
  }): Promise<ProjectRecord | null>;
  saveProjectState(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    state: ProjectStateWrite;
  }): Promise<ProjectRecord | null>;
  archiveProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    previousStatus: Exclude<ProjectStatus, 'ARCHIVED'>;
  }): Promise<ProjectRecord | null>;
  restoreProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
    restoredStatus: Exclude<ProjectStatus, 'ARCHIVED'>;
  }): Promise<ProjectRecord | null>;
  deleteProject(input: {
    workspaceId: string;
    projectId: string;
    expectedVersion: number;
  }): Promise<boolean>;
  createAuditEvent(input: ProjectAuditWrite): Promise<void>;
}

export interface ProjectRepository {
  transaction<T>(
    operation: (transaction: ProjectRepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}
