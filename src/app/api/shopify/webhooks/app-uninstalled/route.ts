import { NextResponse } from 'next/server';
import { getShopifyConfig } from '@/modules/shopify/config';
import { prismaShopifyUninstallStore } from '@/modules/shopify/repositories/prisma-uninstall-store';
import {
  handleShopifyAppUninstalled,
  ShopifyWebhookError,
} from '@/modules/shopify/webhooks/app-uninstalled-service';

const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

async function readWebhookBody(request: Request): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BODY_BYTES) {
    throw new ShopifyWebhookError();
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel();
        throw new ShopifyWebhookError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const config = getShopifyConfig();
    await handleShopifyAppUninstalled({
      store: prismaShopifyUninstallStore,
      apiSecret: config.apiSecret,
    }, {
      rawBody: await readWebhookBody(request),
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

