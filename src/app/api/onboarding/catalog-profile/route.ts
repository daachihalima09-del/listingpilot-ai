import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import { MerchantCatalogProfileError } from '@/modules/onboarding/catalog-profile/errors';
import { resolveMerchantCatalogProfileAccess } from '@/modules/onboarding/catalog-profile/profile-context.server';
import { prismaMerchantCatalogProfileRepository } from '@/modules/onboarding/catalog-profile/prisma-profile-repository.server';
import {
  getMerchantCatalogProfile,
  saveMerchantCatalogProfile,
} from '@/modules/onboarding/catalog-profile/profile-service';
import { merchantCatalogProfileErrorResponse } from '@/modules/onboarding/catalog-profile/route-errors.server';
import {
  merchantCatalogProfileInputSchema,
  merchantCatalogWorkspaceSelectionSchema,
} from '@/modules/onboarding/catalog-profile/validation';

const saveRequestSchema = merchantCatalogProfileInputSchema.extend({
  workspaceId: z.string().uuid(),
  expectedVersion: z.number().int().positive().nullable().optional(),
});

function requireUser(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || user.status !== 'ACTIVE') {
    throw new MerchantCatalogProfileError(
      'AUTH_UNAUTHENTICATED',
      401,
      'Authentication is required.',
    );
  }
  return user;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = requireUser(await getCurrentUser());
    const selection = merchantCatalogWorkspaceSelectionSchema.parse({
      workspaceId: new URL(request.url).searchParams.get('workspaceId'),
    });
    const access = await resolveMerchantCatalogProfileAccess(
      user.id,
      selection.workspaceId,
    );
    const profile = await getMerchantCatalogProfile(
      prismaMerchantCatalogProfileRepository,
      access.workspaceId,
    );
    return NextResponse.json({ profile });
  } catch (error) {
    return merchantCatalogProfileErrorResponse(error);
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const user = requireUser(await getCurrentUser());
    const input = saveRequestSchema.parse(
      await readBoundedJsonRequest(request, 512 * 1024),
    );
    const access = await resolveMerchantCatalogProfileAccess(
      user.id,
      input.workspaceId,
      { requireOwner: true },
    );
    const profile = await saveMerchantCatalogProfile(
      prismaMerchantCatalogProfileRepository,
      access,
      {
        setupMode: input.setupMode,
        collections: input.collections,
        productTypes: input.productTypes,
        vendors: input.vendors,
      },
      input.expectedVersion,
    );
    return NextResponse.json({ profile });
  } catch (error) {
    return merchantCatalogProfileErrorResponse(error);
  }
}
