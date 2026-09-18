import { NextResponse } from 'next/server';
import { getShopifyConfig } from '@/modules/shopify/config';
import { prismaShopifyUninstallStore } from '@/modules/shopify/repositories/prisma-uninstall-store';
import {
  handleShopifyAppUninstalled,
} from '@/modules/shopify/webhooks/app-uninstalled-service';
import { readShopifyWebhookBody } from '@/modules/shopify/webhooks/webhook-request';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const config = getShopifyConfig();
    await handleShopifyAppUninstalled({
      store: prismaShopifyUninstallStore,
      apiSecret: config.apiSecret,
    }, {
      rawBody: await readShopifyWebhookBody(request),
      hmac: request.headers.get('x-shopify-hmac-sha256'),
      shopHeader: request.headers.get('x-shopify-shop-domain'),
      topic: request.headers.get('x-shopify-topic'),
    });
    return new NextResponse(null, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: { code: 'SHOPIFY_WEBHOOK_UNAUTHORIZED' } },
      { status: 401 },
    );
  }
}
