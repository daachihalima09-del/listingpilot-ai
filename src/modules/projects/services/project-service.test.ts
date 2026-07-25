import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ProjectAuditWrite,
  ProjectRecord,
  ProjectRepository,
  ProjectRepositoryTransaction,
  ProjectStateWrite,
  WorkspaceProjectMembership,
} from '../repositories/project-repository.ts';
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  restoreProject,
  saveProjectState,
} from './project-service.ts';
import {
  ProjectForbiddenError,
  ProjectNotFoundError,
  ProjectStaleWriteError,
} from '../types/errors.ts';

const ownerId = '11111111-1111-4111-8111-111111111111';
const memberId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '33333333-3333-4333-8333-333333333333';
const otherWorkspaceId = '44444444-4444-4444-8444-444444444444';
const organizationId = '55555555-5555-4555-8555-555555555555';
const otherOrganizationId = '66666666-6666-4666-8666-666666666666';
const projectId = '77777777-7777-4777-8777-777777777777';
const otherProjectId = '88888888-8888-4888-8888-888888888888';
const now = new Date('2026-07-24T00:00:00.000Z');

function projectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: projectId,
    workspaceId,
    name: 'Saved project',
    status: 'DRAFT',
    statusBeforeArchive: null,
    sourceType: null,
    sourceUrl: null,
    rawInput: null,
    analysisData: null,
    generatedListing: null,
    seoData: null,
    readinessData: null,
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class InMemoryProjectRepository implements ProjectRepository {
  readonly audits: ProjectAuditWrite[] = [];
  readonly projects: ProjectRecord[];
  readonly memberships = new Map<string, WorkspaceProjectMembership>();
  private nextProject = 1;

  constructor(projects: ProjectRecord[] = []) {
    this.projects = projects;
    this.memberships.set(`${ownerId}:${workspaceId}`, {
      organizationId,
      role: 'OWNER',
    });
    this.memberships.set(`${memberId}:${workspaceId}`, {
      organizationId,
      role: 'MEMBER',
    });
    this.memberships.set(`${ownerId}:${otherWorkspaceId}`, {
      organizationId: otherOrganizationId,
      role: 'OWNER',
    });
  }

  async transaction<T>(
    operation: (transaction: ProjectRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    const transaction: ProjectRepositoryTransaction = {
      findWorkspaceMembership: async (userId, targetWorkspaceId) => (
        this.memberships.get(`${userId}:${targetWorkspaceId}`) ?? null
      ),
      listProjects: async (targetWorkspaceId, archived) => this.projects
        .filter((project) => (
          project.workspaceId === targetWorkspaceId
          && (archived ? project.archivedAt !== null : project.archivedAt === null)
        ))
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
      findProject: async (targetWorkspaceId, targetProjectId) => this.projects.find(
        (project) => (
          project.workspaceId === targetWorkspaceId
          && project.id === targetProjectId
        ),
      ) ?? null,
      createProject: async (input) => {
        const id = `99999999-9999-4999-8999-${String(this.nextProject).padStart(12, '0')}`;
        this.nextProject += 1;
        const project = projectRecord({
          id,
          workspaceId: input.workspaceId,
          name: input.name,
          sourceType: input.sourceType,
          sourceUrl: input.sourceUrl,
          rawInput: input.rawInput,
        });
        this.projects.push(project);
        return project;
      },
      renameProject: async (input) => {
        const project = this.projects.find((candidate) => (
          candidate.id === input.projectId
          && candidate.workspaceId === input.workspaceId
          && candidate.version === input.expectedVersion
        ));
        if (!project) {
          return null;
        }
        project.name = input.name;
        project.version += 1;
        project.updatedAt = new Date(now.getTime() + project.version);
        return project;
      },
      saveProjectState: async (input) => {
        const project = this.projects.find((candidate) => (
          candidate.id === input.projectId
          && candidate.workspaceId === input.workspaceId
          && candidate.version === input.expectedVersion
          && candidate.archivedAt === null
        ));
        if (!project) {
          return null;
        }
        applyState(project, input.state);
        project.version += 1;
        return project;
      },
      archiveProject: async (input) => {
        const project = this.projects.find((candidate) => (
          candidate.id === input.projectId
          && candidate.workspaceId === input.workspaceId
          && candidate.version === input.expectedVersion
          && candidate.archivedAt === null
        ));
        if (!project) {
          return null;
        }
        project.statusBeforeArchive = input.previousStatus;
        project.status = 'ARCHIVED';
        project.archivedAt = now;
        project.version += 1;
        return project;
      },
      restoreProject: async (input) => {
        const project = this.projects.find((candidate) => (
          candidate.id === input.projectId
          && candidate.workspaceId === input.workspaceId
          && candidate.version === input.expectedVersion
          && candidate.archivedAt !== null
        ));
        if (!project) {
          return null;
        }
        project.status = input.restoredStatus;
        project.statusBeforeArchive = null;
        project.archivedAt = null;
        project.version += 1;
        return project;
      },
      deleteProject: async (input) => {
        const index = this.projects.findIndex((candidate) => (
          candidate.id === input.projectId
          && candidate.workspaceId === input.workspaceId
          && candidate.version === input.expectedVersion
        ));
        if (index === -1) {
          return false;
        }
        this.projects.splice(index, 1);
        return true;
      },
      createAuditEvent: async (input) => {
        this.audits.push(input);
      },
    };
    return operation(transaction);
  }
}

function applyState(project: ProjectRecord, state: ProjectStateWrite) {
  project.sourceType = state.sourceType;
  project.sourceUrl = state.sourceUrl;
  project.rawInput = state.rawInput;
  project.analysisData = state.analysisData;
  project.generatedListing = state.generatedListing;
  project.seoData = state.seoData;
  project.readinessData = state.readinessData;
  project.status = state.status;
}

function lifecycleInput(version = 1) {
  return {
    workspaceId,
    projectId,
    version,
  };
}

test('OWNER creates a tenant-scoped project and project.created audit event', async () => {
  const repository = new InMemoryProjectRepository();
  const project = await createProject(repository, ownerId, {
    workspaceId,
    name: '  New project  ',
    sourceType: null,
    sourceUrl: null,
    rawInput: null,
  });

  assert.equal(project.name, 'New project');
  assert.equal(project.workspaceId, workspaceId);
  assert.equal(repository.audits[0]?.action, 'project.created');
  assert.equal(repository.audits[0]?.workspaceId, workspaceId);
});

test('project listing is scoped to the active workspace', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord(),
    projectRecord({ id: otherProjectId, workspaceId: otherWorkspaceId }),
  ]);
  const projects = await listProjects(repository, ownerId, {
    workspaceId,
    archived: false,
  });

  assert.deepEqual(projects.map((project) => project.id), [projectId]);
});

test('a project ID from another workspace returns 404', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord({ id: otherProjectId, workspaceId: otherWorkspaceId }),
  ]);

  await assert.rejects(
    getProject(repository, ownerId, {
      workspaceId,
      projectId: otherProjectId,
    }),
    ProjectNotFoundError,
  );
});

test('OWNER renames a project and creates project.updated audit event', async () => {
  const repository = new InMemoryProjectRepository([projectRecord()]);
  const project = await renameProject(repository, ownerId, {
    ...lifecycleInput(),
    name: 'Renamed project',
  });

  assert.equal(project.name, 'Renamed project');
  assert.equal(project.version, 2);
  assert.equal(repository.audits[0]?.action, 'project.updated');
});

test('non-owner project mutation is rejected before writes and audits', async () => {
  const repository = new InMemoryProjectRepository([projectRecord()]);

  await assert.rejects(
    renameProject(repository, memberId, {
      ...lifecycleInput(),
      name: 'Forbidden rename',
    }),
    ProjectForbiddenError,
  );
  assert.equal(repository.projects[0]?.name, 'Saved project');
  assert.equal(repository.audits.length, 0);
});

test('archive and restore preserve the honest pre-archive status and audit both actions', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord({ status: 'READY' }),
  ]);
  const archived = await archiveProject(repository, ownerId, lifecycleInput());
  assert.equal(archived.status, 'ARCHIVED');
  assert.ok(archived.archivedAt);

  const restored = await restoreProject(
    repository,
    ownerId,
    lifecycleInput(archived.version),
  );
  assert.equal(restored.status, 'READY');
  assert.equal(restored.archivedAt, null);
  assert.deepEqual(
    repository.audits.map((audit) => audit.action),
    ['project.archived', 'project.restored'],
  );
});

test('permanent delete removes only the tenant project and retains its audit event', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord(),
    projectRecord({ id: otherProjectId, workspaceId: otherWorkspaceId }),
  ]);
  await deleteProject(repository, ownerId, lifecycleInput());

  assert.deepEqual(repository.projects.map((project) => project.id), [otherProjectId]);
  assert.equal(repository.audits[0]?.action, 'project.deleted');
  assert.equal(repository.audits[0]?.entityId, projectId);
});

test('safe project state persists structured analysis and readiness data', async () => {
  const repository = new InMemoryProjectRepository([projectRecord()]);
  const saved = await saveProjectState(repository, ownerId, {
    ...lifecycleInput(),
    sourceType: 'RAW_SPECIFICATIONS',
    sourceUrl: null,
    rawInput: 'Material: cotton',
    analysisData: null,
    generatedListing: {
      title: 'Cotton shirt',
      description: 'A comfortable cotton shirt.',
      keyFeatures: 'Cotton',
    },
    seoData: {
      seoTitle: 'Cotton Shirt',
      seoDescription: 'Comfortable cotton shirt.',
      tags: 'cotton,shirt',
    },
    readinessData: {
      analysisStarted: false,
      activeStage: 'input',
      completedStages: [],
      shopifyReady: false,
    },
  });

  assert.equal(saved.rawInput, 'Material: cotton');
  assert.equal(saved.generatedListing?.title, 'Cotton shirt');
  assert.equal(saved.status, 'DRAFT');
  assert.equal(repository.audits[0]?.action, 'project.updated');
});

test('stale project state cannot silently overwrite a newer version', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord({ version: 2 }),
  ]);

  await assert.rejects(
    renameProject(repository, ownerId, {
      ...lifecycleInput(1),
      name: 'Stale rename',
    }),
    ProjectStaleWriteError,
  );
  assert.equal(repository.projects[0]?.name, 'Saved project');
  assert.equal(repository.audits.length, 0);
});

test('archived projects are excluded from the default list and available in the archived view', async () => {
  const repository = new InMemoryProjectRepository([
    projectRecord(),
    projectRecord({
      id: otherProjectId,
      status: 'ARCHIVED',
      statusBeforeArchive: 'DRAFT',
      archivedAt: now,
    }),
  ]);

  const active = await listProjects(repository, ownerId, {
    workspaceId,
    archived: false,
  });
  const archived = await listProjects(repository, ownerId, {
    workspaceId,
    archived: true,
  });
  assert.deepEqual(active.map((project) => project.id), [projectId]);
  assert.deepEqual(archived.map((project) => project.id), [otherProjectId]);
});
