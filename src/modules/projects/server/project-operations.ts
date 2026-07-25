import 'server-only';

import { prismaProjectRepository } from '../repositories/prisma-project-repository';
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  restoreProject,
  saveProjectState,
} from '../services/project-service';

export function listUserProjects(actorUserId: string, input: unknown) {
  return listProjects(prismaProjectRepository, actorUserId, input);
}

export function getUserProject(actorUserId: string, input: unknown) {
  return getProject(prismaProjectRepository, actorUserId, input);
}

export function createUserProject(actorUserId: string, input: unknown) {
  return createProject(prismaProjectRepository, actorUserId, input);
}

export function renameUserProject(actorUserId: string, input: unknown) {
  return renameProject(prismaProjectRepository, actorUserId, input);
}

export function saveUserProjectState(actorUserId: string, input: unknown) {
  return saveProjectState(prismaProjectRepository, actorUserId, input);
}

export function archiveUserProject(actorUserId: string, input: unknown) {
  return archiveProject(prismaProjectRepository, actorUserId, input);
}

export function restoreUserProject(actorUserId: string, input: unknown) {
  return restoreProject(prismaProjectRepository, actorUserId, input);
}

export function deleteUserProject(actorUserId: string, input: unknown) {
  return deleteProject(prismaProjectRepository, actorUserId, input);
}
