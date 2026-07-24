import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  readSettingsRequestBody,
  settingsRouteErrorResponse,
  unauthenticatedSettingsResponse,
} from '@/modules/settings/server/route-helpers';
import { updateWorkspaceSettings } from '@/modules/settings/server/update-settings';

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
