import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import { MerchantPreferenceError, publishingProfileDataSchema } from '@/modules/merchant-preferences';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { merchantPublishingProfileErrorResponse } from '@/modules/onboarding/publishing-profile/route-errors.server';
import { getMerchantPublishingProfileView, publishingProfileWorkspaceSchema, saveMerchantPublishingProfile } from '@/modules/onboarding/publishing-profile/publishing-profile-service';

const saveSchema = z.object({ workspaceId: z.string().uuid(), expectedVersion: z.number().int().positive().nullable(), data: publishingProfileDataSchema }).strict();
function requireUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.status !== 'ACTIVE') throw new MerchantPreferenceError('WORKSPACE_FORBIDDEN', 401, 'Authentication is required.');
  return user;
}
export async function GET(request: Request) {
  try {
    const user = requireUser(await getCurrentUser());
    const input = publishingProfileWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get('workspaceId') });
    const access = await resolveMerchantListingProfileAccess(user.id, input.workspaceId);
    return NextResponse.json(await getMerchantPublishingProfileView(access.workspaceId));
  } catch (error) { return merchantPublishingProfileErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const user = requireUser(await getCurrentUser());
    const input = saveSchema.parse(await readBoundedJsonRequest(request, 512 * 1024));
    const access = await resolveMerchantListingProfileAccess(user.id, input.workspaceId, true);
    await saveMerchantPublishingProfile(access, input.data, input.expectedVersion);
    return NextResponse.json(await getMerchantPublishingProfileView(access.workspaceId));
  } catch (error) { return merchantPublishingProfileErrorResponse(error); }
}
