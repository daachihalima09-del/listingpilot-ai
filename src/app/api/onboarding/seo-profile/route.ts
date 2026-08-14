import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import { MerchantPreferenceError, seoProfileDataSchema } from '@/modules/merchant-preferences';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { getMerchantSeoProfileView, saveMerchantSeoProfile, seoProfileWorkspaceSchema } from '@/modules/onboarding/seo-profile/seo-profile-service';
import { merchantSeoProfileErrorResponse } from '@/modules/onboarding/seo-profile/route-errors.server';

const saveSchema = z.object({ workspaceId: z.string().uuid(), expectedVersion: z.number().int().positive().nullable(), data: seoProfileDataSchema }).strict();
function requireUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.status !== 'ACTIVE') throw new MerchantPreferenceError('WORKSPACE_FORBIDDEN', 401, 'Authentication is required.');
  return user;
}
export async function GET(request: Request) {
  try {
    const user = requireUser(await getCurrentUser());
    const input = seoProfileWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get('workspaceId') });
    const access = await resolveMerchantListingProfileAccess(user.id, input.workspaceId);
    return NextResponse.json(await getMerchantSeoProfileView(access.workspaceId));
  } catch (error) { return merchantSeoProfileErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    const user = requireUser(await getCurrentUser());
    const input = saveSchema.parse(await readBoundedJsonRequest(request, 512 * 1024));
    const access = await resolveMerchantListingProfileAccess(user.id, input.workspaceId, true);
    await saveMerchantSeoProfile(access, input.data, input.expectedVersion);
    return NextResponse.json(await getMerchantSeoProfileView(access.workspaceId));
  } catch (error) { return merchantSeoProfileErrorResponse(error); }
}
