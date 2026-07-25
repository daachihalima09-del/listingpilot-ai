import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/auth/server/context';
import { readBoundedJsonRequest } from '@/lib/server/json-request';
import { disconnectPrismaShopifyStore } from '@/modules/shopify/repositories/prisma-disconnect-store';
import { shopifyRouteErrorResponse } from '@/modules/shopify/server/route-helpers';
import {
  ShopifyForbiddenError,
  ShopifyUnauthenticatedError,
} from '@/modules/shopify/types/errors';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';

const disconnectInputSchema = z.object({
  confirm: z.literal(true),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return shopifyRouteErrorResponse(new ShopifyUnauthenticatedError());
  }

  try {
    disconnectInputSchema.parse(
      await readBoundedJsonRequest(request, 1024),
    );
    let tenant;
    try {
      tenant = await getTenantContextForUser(user.id);
    } catch {
      throw new ShopifyForbiddenError();
    }
    if (!tenant.workspace) {
      throw new ShopifyForbiddenError();
    }
    const result = await disconnectPrismaShopifyStore({
      actorUserId: user.id,
      organizationId: tenant.organization.id,
      workspaceId: tenant.workspace.id,
      role: tenant.role,
    });
    return NextResponse.json(result);
  } catch (error) {
    return shopifyRouteErrorResponse(error);
  }
}
