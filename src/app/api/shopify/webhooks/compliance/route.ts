import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getShopifyConfig } from '@/modules/shopify/config';
import {
  prismaShopifyComplianceWebhookStore,
} from '@/modules/shopify/repositories/prisma-compliance-webhook-store';
import {
  handleShopifyComplianceWebhook,
} from '@/modules/shopify/webhooks/compliance-service';
import {
  readShopifyWebhookBody,
  ShopifyWebhookRequestError,
} from '@/modules/shopify/webhooks/webhook-request';

export async function POST(request: Request): Promise<NextResponse> {
  let reference: string = randomUUID();
  try {
    const config = getShopifyConfig();
    const result = await handleShopifyComplianceWebhook({
      apiSecret: config.apiSecret,
      store: prismaShopifyComplianceWebhookStore,
    }, {
      rawBody: await readShopifyWebhookBody(request),
      headers: request.headers,
    });
    reference = result.webhookId;
    console.info('Shopify compliance webhook acknowledged.', {
      reference,
      topic: result.topic,
      knownShop: result.knownShop,
      duplicate: result.duplicate,
      outcome: result.outcome,
    });
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    if (error instanceof ShopifyWebhookRequestError) {
      console.warn('Shopify compliance webhook rejected.', {
        reference,
        code: error.code,
      });
      return NextResponse.json(
        { error: { code: error.code, reference } },
        { status: error.statusCode },
      );
    }
    console.error('Shopify compliance webhook persistence failed.', {
      reference,
      code: 'SHOPIFY_WEBHOOK_PERSISTENCE_FAILED',
    });
    return NextResponse.json(
      { error: { code: 'SHOPIFY_WEBHOOK_UNAVAILABLE', reference } },
      { status: 500 },
    );
  }
}
