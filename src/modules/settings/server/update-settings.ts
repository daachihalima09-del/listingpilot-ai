import 'server-only';

import { prisma } from '@/lib/prisma';
import {
  updateOrganizationSettingsWithDatabase,
  updateWorkspaceSettingsWithDatabase,
} from '../services/tenant-settings';

export async function updateOrganizationSettings(
  actorUserId: string,
  input: unknown,
) {
  return updateOrganizationSettingsWithDatabase(prisma, actorUserId, input);
}

export async function updateWorkspaceSettings(
  actorUserId: string,
  input: unknown,
) {
  return updateWorkspaceSettingsWithDatabase(prisma, actorUserId, input);
}
