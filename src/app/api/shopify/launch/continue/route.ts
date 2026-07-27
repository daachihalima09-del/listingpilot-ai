import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readBoundedTextRequest } from '@/lib/server/json-request';
import { getCurrentUser } from '@/modules/auth/server/context';
import { getShopifyConfig } from '@/modules/shopify/config';
import { decryptShopifyAccessToken } from '@/modules/shopify/crypto/token-encryption.server';
import {
  assessShopifyLaunchConnection,
  type ShopifyLaunchConnectionAssessment,
} from '@/modules/shopify/launch/connection-assessment';
import { recordShopifyLaunchAuditSafely } from '@/modules/shopify/launch/launch-audit.server';
import { ShopifyLaunchError } from '@/modules/shopify/launch/launch-errors';
import { resolveShopifyLaunchIntent } from '@/modules/shopify/launch/launch-intent-service';
import { buildShopifyAuthorizationUrl } from '@/modules/shopify/oauth/authorization-url';
import {
  generateShopifyOAuthState,
  shopifyOAuthStateCookieName,
  shopifyOAuthStateCookieOptions,
  shopifyOAuthStateExpiresAt,
} from '@/modules/shopify/oauth/state';
import { prismaShopifyLaunchConnectionStore } from '@/modules/shopify/repositories/prisma-launch-connection-store';
import { prismaShopifyLaunchIntentStore } from '@/modules/shopify/repositories/prisma-launch-intent-repository';
import { prismaShopifyLaunchWorkspaceStore } from '@/modules/shopify/repositories/prisma-launch-workspace-store';
import { createShopifyOAuthState } from '@/modules/shopify/repositories/oauth-state-repository';

const continueSchema = z.object({
  intent: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  workspaceId: z.string().uuid(),
}).strict();

function continuationUrl(
  appUrl: string,
  intent: string,
  error: string,
): URL {
  const url = new URL('/shopify/launch', appUrl);
  if (intent) url.searchParams.set('intent', intent);
  url.searchParams.set('error', error);
  return url;
}

function requiresOAuth(
  assessment: ShopifyLaunchConnectionAssessment,
): boolean {
  return [
    'TOKEN_MISSING',
    'SCOPE_UPGRADE_REQUIRED',
    'DISCONNECTED',
    'INVALID_CONNECTION',
  ].includes(assessment);
}

export async function POST(request: Request): Promise<NextResponse> {
  const config = getShopifyConfig();
  let rawIntent = '';
  try {
    const body = new URLSearchParams(await readBoundedTextRequest(request, 4096));
    const input = continueSchema.parse({
      intent: body.get('intent') ?? undefined,
      workspaceId: body.get('workspaceId') ?? undefined,
    });
    rawIntent = input.intent;
    const user = await getCurrentUser();
    if (!user || user.status !== 'ACTIVE') {
      const callbackUrl = `/shopify/launch?${new URLSearchParams({
        intent: input.intent,
      })}`;
      const signIn = new URL('/sign-in', config.appUrl);
      signIn.searchParams.set('callbackUrl', callbackUrl);
      return NextResponse.redirect(signIn, 303);
    }

    const intent = await resolveShopifyLaunchIntent(
      prismaShopifyLaunchIntentStore,
      input.intent,
    );
    const workspace = await prismaShopifyLaunchWorkspaceStore.findForUser(
      user.id,
      input.workspaceId,
    );
    if (!workspace) {
      throw new ShopifyLaunchError('workspace_unavailable', 404);
    }
    if (workspace.role !== 'OWNER') {
      throw new ShopifyLaunchError('owner_required', 403);
    }

    const now = new Date();
    if (!await prismaShopifyLaunchIntentStore.selectWorkspace({
      id: intent.id,
      workspaceId: workspace.id,
      userId: user.id,
      now,
    })) {
      throw new ShopifyLaunchError('consumed', 409);
    }
    await recordShopifyLaunchAuditSafely({
      action: 'shopify.launch_workspace_selected',
      intentId: intent.id,
      userId: user.id,
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      metadata: { origin: intent.origin },
    });

    const assessment = await assessShopifyLaunchConnection({
      store: prismaShopifyLaunchConnectionStore,
      decryptToken: (encrypted) => decryptShopifyAccessToken(
        encrypted,
        config.tokenEncryptionKey,
      ),
    }, {
      workspaceId: workspace.id,
      shopDomain: intent.shopDomain,
      requiredScopes: config.scopes,
    });

    if (assessment === 'SHOP_MISMATCH') {
      return NextResponse.redirect(
        continuationUrl(config.appUrl, input.intent, 'shop_mismatch'),
        303,
      );
    }
    if (assessment === 'CONNECTED_AND_USABLE') {
      await prismaShopifyLaunchIntentStore.consume(intent.id, now);
      await recordShopifyLaunchAuditSafely({
        action: 'shopify.connection_completed_from_launch',
        intentId: intent.id,
        userId: user.id,
        organizationId: workspace.organizationId,
        workspaceId: workspace.id,
        metadata: {
          shopDomain: intent.shopDomain,
          scopeSufficient: true,
        },
      });
      return NextResponse.redirect(
        new URL(intent.safeReturnPath ?? '/settings/shopify', config.appUrl),
        303,
      );
    }
    if (!requiresOAuth(assessment)) {
      throw new ShopifyLaunchError('connection_invalid', 409);
    }

    const state = generateShopifyOAuthState();
    await createShopifyOAuthState({
      state,
      userId: user.id,
      workspaceId: workspace.id,
      shopDomain: intent.shopDomain,
      expiresAt: shopifyOAuthStateExpiresAt(now),
      launchIntentId: intent.id,
    });
    if (!await prismaShopifyLaunchIntentStore.markOAuthStarted(intent.id, now)) {
      throw new ShopifyLaunchError('consumed', 409);
    }
    await recordShopifyLaunchAuditSafely({
      action: 'shopify.oauth_continued_from_launch',
      intentId: intent.id,
      userId: user.id,
      organizationId: workspace.organizationId,
      workspaceId: workspace.id,
      metadata: {
        connectionAssessment: assessment,
        origin: intent.origin,
      },
    });
    const response = NextResponse.redirect(
      buildShopifyAuthorizationUrl(config, {
        shopDomain: intent.shopDomain,
        state,
      }),
      303,
    );
    response.cookies.set(
      shopifyOAuthStateCookieName(),
      state,
      shopifyOAuthStateCookieOptions(),
    );
    return response;
  } catch (error) {
    const reason = error instanceof ShopifyLaunchError
      ? error.reason
      : 'invalid_request';
    return NextResponse.redirect(
      continuationUrl(config.appUrl, rawIntent, reason),
      303,
    );
  }
}
