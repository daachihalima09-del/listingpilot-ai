import { NextResponse } from 'next/server';
import { getShopifyConfig } from '@/modules/shopify/config';
import { recordShopifyLaunchAuditSafely } from '@/modules/shopify/launch/launch-audit.server';
import { ShopifyLaunchError } from '@/modules/shopify/launch/launch-errors';
import { createShopifyLaunchIntent } from '@/modules/shopify/launch/launch-intent-service';
import { verifyShopifyLaunchRequest } from '@/modules/shopify/launch/launch-verification';
import { prismaShopifyLaunchIntentStore } from '@/modules/shopify/repositories/prisma-launch-intent-repository';

function launchPageUrl(
  appUrl: string,
  parameters: Record<string, string>,
): URL {
  const url = new URL('/shopify/launch', appUrl);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: Request): Promise<NextResponse> {
  let appUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
  await recordShopifyLaunchAuditSafely({
    action: 'shopify.launch_received',
    metadata: { origin: 'SHOPIFY' },
  });

  try {
    const config = getShopifyConfig();
    appUrl = config.appUrl;
    const verified = verifyShopifyLaunchRequest(request.url, config.apiSecret);
    const { nonce, intent } = await createShopifyLaunchIntent(
      prismaShopifyLaunchIntentStore,
      verified,
    );
    await recordShopifyLaunchAuditSafely({
      action: 'shopify.launch_verified',
      intentId: intent.id,
      metadata: {
        shopDomain: intent.shopDomain,
        origin: intent.origin,
      },
    });
    return NextResponse.redirect(launchPageUrl(appUrl, { intent: nonce }));
  } catch (error) {
    const reason = error instanceof ShopifyLaunchError
      ? error.reason
      : 'invalid_request';
    await recordShopifyLaunchAuditSafely({
      action: reason === 'expired'
        ? 'shopify.launch_expired'
        : 'shopify.launch_rejected',
      metadata: { category: reason },
    });
    return NextResponse.redirect(launchPageUrl(appUrl, { error: reason }));
  }
}
