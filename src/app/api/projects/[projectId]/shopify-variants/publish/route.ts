import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  publishUserShopifyVariants,
} from '@/modules/shopify/variants/variant-operations.server';
import {
  readShopifyVariantConfiguration,
  shopifyVariantErrorResponse,
  unauthenticatedVariantResponse,
} from '@/modules/shopify/variants/variant-route-helpers.server';

const emptyPublishBodySchema = z.object({}).strict();

interface ShopifyVariantPublishRouteContext {
  params: Promise<{ projectId: string }>;
}

export async function POST(
  request: Request,
  context: ShopifyVariantPublishRouteContext,
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return unauthenticatedVariantResponse();
  try {
    emptyPublishBodySchema.parse(
      await readShopifyVariantConfiguration(request),
    );
    const { projectId } = await context.params;
    return NextResponse.json(
      await publishUserShopifyVariants(user.id, projectId),
    );
  } catch (error) {
    return shopifyVariantErrorResponse(error);
  }
}
