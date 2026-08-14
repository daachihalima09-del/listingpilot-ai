import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  listingStandardIdSchema,
  MerchantPreferenceError,
} from '@/modules/merchant-preferences';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { selectListingStandard } from '@/modules/onboarding/listing-profile/listing-profile-service';
import { merchantListingProfileErrorResponse } from '@/modules/onboarding/listing-profile/route-errors.server';

const saveSchema = z.object({
  workspaceId: z.string().uuid(),
  standardId: listingStandardIdSchema,
  expectedVersion: z.number().int().positive().nullable(),
}).strict();

function requireUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.status !== 'ACTIVE') {
    throw new MerchantPreferenceError(
      'WORKSPACE_FORBIDDEN',
      401,
      'Authentication is required.',
    );
  }
  return user;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = requireUser(await getCurrentUser());
    const input = saveSchema.parse(
      await readBoundedJsonRequest(request, 128 * 1024),
    );
    const access = await resolveMerchantListingProfileAccess(
      user.id,
      input.workspaceId,
      true,
    );
    const profile = await selectListingStandard(
      access,
      input.standardId,
      input.expectedVersion,
      'settings',
    );
    return NextResponse.json({ profile });
  } catch (error) {
    return merchantListingProfileErrorResponse(error);
  }
}
