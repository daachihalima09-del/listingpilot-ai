import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { getShopifyConfig } from '@/modules/shopify/config';
import { buildShopifyAuthorizationUrl } from '@/modules/shopify/oauth/authorization-url';
import {
  generateShopifyOAuthState,
  shopifyOAuthStateExpiresAt,
  shopifyOAuthStateCookieName,
  shopifyOAuthStateCookieOptions,
} from '@/modules/shopify/oauth/state';
import { createShopifyOAuthState } from '@/modules/shopify/repositories/oauth-state-repository';
import {
  readShopifyConnectRequestBody,
  shopifyRouteErrorResponse,
} from '@/modules/shopify/server/route-helpers';
import { ShopifyUnauthenticatedError } from '@/modules/shopify/types/errors';
import { shopifyConnectInputSchema } from '@/modules/shopify/validators/shop-domain';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';
import { resolveShopifyConnectTenant } from '@/modules/shopify/services/connect-authorization';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user || user.status !== 'ACTIVE') {
    return shopifyRouteErrorResponse(new ShopifyUnauthenticatedError());
  }

  try {
    const body = await readShopifyConnectRequestBody(request);
    const input = shopifyConnectInputSchema.parse(body);
    const selection = 'workspaceId' in input
      ? {
          organizationId: input.organizationId,
          workspaceId: input.workspaceId,
        }
      : {};
    const tenant = await resolveShopifyConnectTenant({
      findForUser: getTenantContextForUser,
    }, user.id, selection);

    const state = generateShopifyOAuthState();
    const authorizationUrl = buildShopifyAuthorizationUrl(
      getShopifyConfig(),
      {
        shopDomain: input.shop,
        state,
      },
    );
    await createShopifyOAuthState({
      state,
      userId: user.id,
      workspaceId: tenant.workspace.id,
      shopDomain: input.shop,
      expiresAt: shopifyOAuthStateExpiresAt(),
    });
    const response = NextResponse.json({ authorizationUrl });
    response.cookies.set(
      shopifyOAuthStateCookieName(),
      state,
      shopifyOAuthStateCookieOptions(),
    );
    return response;
  } catch (error) {
    return shopifyRouteErrorResponse(error);
  }
}
