import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  readSettingsRequestBody,
  settingsRouteErrorResponse,
  unauthenticatedSettingsResponse,
} from '@/modules/settings/server/route-helpers';
import { updateOrganizationSettings } from '@/modules/settings/server/update-settings';

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return unauthenticatedSettingsResponse();
  }

  try {
    const input = await readSettingsRequestBody(request);
    const organization = await updateOrganizationSettings(user.id, input);
    return NextResponse.json({ organization });
  } catch (error) {
    return settingsRouteErrorResponse(error);
  }
}
