import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  readSettingsRequestBody,
  settingsRouteErrorResponse,
  unauthenticatedSettingsResponse,
} from '@/modules/settings/server/route-helpers';
import {
  createWorkspace,
  updateWorkspaceSettings,
} from '@/modules/settings/server/update-settings';
import { workspaceProjectsPath } from '@/modules/settings/workspace-navigation';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') {
    return unauthenticatedSettingsResponse();
  }

  try {
    const input = await readSettingsRequestBody(request);
    const workspace = await createWorkspace(user.id, input);
    return NextResponse.json({
      workspace,
      redirectTo: workspaceProjectsPath({
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
      }),
    }, { status: 201 });
  } catch (error) {
    return settingsRouteErrorResponse(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedSettingsResponse();
  }

  try {
    const input = await readSettingsRequestBody(request);
    const workspace = await updateWorkspaceSettings(user.id, input);
    return NextResponse.json({ workspace });
  } catch (error) {
    return settingsRouteErrorResponse(error);
  }
}
