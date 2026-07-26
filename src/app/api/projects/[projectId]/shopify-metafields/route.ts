import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  getUserShopifyMetafields,
  saveUserShopifyMetafields,
} from '@/modules/shopify/metafields/metafield-operations.server';
import {
  readShopifyMetafieldRequest,
  shopifyMetafieldErrorResponse,
  unauthenticatedMetafieldResponse,
} from '@/modules/shopify/metafields/metafield-route-helpers.server';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedMetafieldResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await getUserShopifyMetafields(user.id, projectId),
    });
  } catch (error) {
    return shopifyMetafieldErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedMetafieldResponse();
  try {
    const { projectId } = await context.params;
    return NextResponse.json({
      configuration: await saveUserShopifyMetafields(
        user.id,
        projectId,
        await readShopifyMetafieldRequest(request),
      ),
    });
  } catch (error) {
    return shopifyMetafieldErrorResponse(error);
  }
}

