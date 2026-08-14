import 'server-only';
import { getUserProject } from '../../projects/server/project-operations.ts';
import { prismaListingCalibrationRepository } from '../persistence/prisma-repository.server.ts';
import { ListingCalibrationService } from './calibration-service.ts';

export const serverListingCalibrationService = new ListingCalibrationService({
  repository: prismaListingCalibrationRepository,
  loadProject: async (actorUserId, workspaceId, projectId) => getUserProject(actorUserId, { workspaceId, projectId }) as never,
});
