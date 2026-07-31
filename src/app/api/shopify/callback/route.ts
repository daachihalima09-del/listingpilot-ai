import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/auth/server/context';
import { getShopifyConfig } from '@/modules/shopify/config';
import { encryptShopifyAccessToken } from '@/modules/shopify/crypto/token-encryption.server';
import {
  completeShopifyOAuthCallback,
  type ShopifyCallbackDependencies,
} from '@/modules/shopify/oauth/callback-service';
import {
  shopifyCallbackErrorUrl,
  shopifyCallbackSuccessUrl,
} from '@/modules/shopify/oauth/callback-redirect';
import {
  exchangeShopifyAuthorizationCode,
  verifyShopifyShop,
} from '@/modules/shopify/oauth/shopify-client';
import {
  expiredShopifyOAuthStateCookieOptions,
  shopifyOAuthStateCookieName,
} from '@/modules/shopify/oauth/state';
import {
  consumeShopifyOAuthState,
  findShopifyOAuthState,
} from '@/modules/shopify/repositories/oauth-state-repository';
import {
  completeShopifyLaunchIntent,
} from '@/modules/shopify/launch/launch-intent-service';
import {
  recordShopifyLaunchAuditSafely,
} from '@/modules/shopify/launch/launch-audit.server';
import {
  persistPrismaShopifyConnection,
  recordShopifyOAuthFailure,
} from '@/modules/shopify/repositories/prisma-connection-repository';
import { prismaShopifyLaunchIntentStore } from '@/modules/shopify/repositories/prisma-launch-intent-repository';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';
import { ShopifyCallbackError } from '@/modules/shopify/types/errors';
import { returnPathAfterShopifyConnection } from '@/modules/onboarding/catalog-profile/onboarding-gate.server';

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(
    shopifyOAuthStateCookieName(),
    '',
    expiredShopifyOAuthStateCookieOptions(),
  );
}

export async function GET(request: Request): Promise<NextResponse> {
  let appUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
  try {
    const config = getShopifyConfig();
    appUrl = config.appUrl;
    const user = await getCurrentUser();
    if (!user || user.status !== 'ACTIVE') {
      throw new ShopifyCallbackError('invalid_state', 'unauthenticated');
    }

    const dependencies: ShopifyCallbackDependencies = {
      findState: findShopifyOAuthState,
      consumeState: consumeShopifyOAuthState,
      async findTenant(userId, workspaceId) {
        try {
          const context = await getTenantContextForUser(userId, { workspaceId });
          return {
            organizationId: context.organization.id,
            workspaceId: context.workspace?.id ?? '',
            role: context.role,
          };
        } catch {
          return null;
        }
      },
      exchangeCode: (input) => exchangeShopifyAuthorizationCode(config, input),
      verifyShop: (input) => verifyShopifyShop(config, input),
      encryptToken: (token) => encryptShopifyAccessToken(
        token,
        config.tokenEncryptionKey,
      ),
      persistConnection: persistPrismaShopifyConnection,
      recordFailure: recordShopifyOAuthFailure,
    };
    const cookieState = request.headers
      .get('cookie')
      ?.split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${shopifyOAuthStateCookieName()}=`))
      ?.slice(shopifyOAuthStateCookieName().length + 1);
    const result = await completeShopifyOAuthCallback(dependencies, config, {
      requestUrl: request.url,
      cookieState: cookieState ? decodeURIComponent(cookieState) : undefined,
      actorUserId: user.id,
    });

    const completedProfileReturnPath = result.launchIntentId
      ? await completeShopifyLaunchIntent(
          prismaShopifyLaunchIntentStore,
          result.launchIntentId,
        )
      : '/settings/shopify';
    const safeReturnPath = await returnPathAfterShopifyConnection(
      result.workspaceId,
      completedProfileReturnPath,
    );
    if (result.launchIntentId) {
      await recordShopifyLaunchAuditSafely({
        action: 'shopify.connection_completed_from_launch',
        intentId: result.launchIntentId,
        userId: user.id,
        metadata: { shopDomain: result.shopDomain, scopeSufficient: true },
      });
    }
    const response = NextResponse.redirect(
      shopifyCallbackSuccessUrl(appUrl, safeReturnPath),
    );
    clearStateCookie(response);
    return response;
  } catch (error) {
    const reason = error instanceof ShopifyCallbackError
      ? error.reason
      : 'connection_failed';
    const response = NextResponse.redirect(
      shopifyCallbackErrorUrl(appUrl, reason),
    );
    clearStateCookie(response);
    return response;
  }
}
