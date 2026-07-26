import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  publishUserShopifyProject,
} from '@/modules/shopify/publishing/publication-operations.server';
import {
  readShopifyPublicationBody,
  shopifyPublicationErrorResponse,
} from '@/modules/shopify/publishing/publication-route-helpers.server';

interface ShopifyPublicationRouteContext {
  params: Promise<{ projectId: string }>;
}

async function publish(
  request: Request,
  context: ShopifyPublicationRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      error: {
        code: 'AUTH_UNAUTHENTICATED',
        message: 'Authentication is required.',
      },
    }, { status: 401 });
  }

  try {
    const { projectId } = await context.params;
    const result = await publishUserShopifyProject(
      user.id,
      projectId,
      await readShopifyPublicationBody(request),
    );
    return NextResponse.json(result, {
      status: result.outcome === 'CREATED' ? 201 : 200,
    });
  } catch (error) {
    return shopifyPublicationErrorResponse(error);
  }
}

export const POST = publish;
export const PATCH = publish;
