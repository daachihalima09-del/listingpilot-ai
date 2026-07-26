import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  publishUserShopifyMetafields,
} from '@/modules/shopify/metafields/metafield-operations.server';
import {
  readShopifyMetafieldRequest,
  shopifyMetafieldErrorResponse,
  unauthenticatedMetafieldResponse,
} from '@/modules/shopify/metafields/metafield-route-helpers.server';

const emptyBody = z.object({}).strict();

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedMetafieldResponse();
  try {
    emptyBody.parse(await readShopifyMetafieldRequest(request));
    const { projectId } = await context.params;
    return NextResponse.json(
      await publishUserShopifyMetafields(user.id, projectId),
    );
  } catch (error) {
    return shopifyMetafieldErrorResponse(error);
  }
}

