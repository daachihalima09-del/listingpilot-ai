import { createHash } from 'node:crypto';
import { normalizeShopDomain } from '../validators/shop-domain.ts';
import { verifyShopifyWebhookHmac } from './webhook-hmac.ts';

export const MAX_SHOPIFY_WEBHOOK_BODY_BYTES = 256 * 1024;

export type ShopifyComplianceTopic =
  | 'customers/data_request'
  | 'customers/redact'
  | 'shop/redact';

export const SHOPIFY_COMPLIANCE_TOPICS: readonly ShopifyComplianceTopic[] = [
  'customers/data_request',
  'customers/redact',
  'shop/redact',
];

type WebhookStatus = 400 | 401 | 413 | 415;

export class ShopifyWebhookRequestError extends Error {
  readonly code:
    | 'SHOPIFY_WEBHOOK_INVALID'
    | 'SHOPIFY_WEBHOOK_UNAUTHORIZED'
    | 'SHOPIFY_WEBHOOK_TOO_LARGE'
    | 'SHOPIFY_WEBHOOK_UNSUPPORTED_MEDIA';
  readonly statusCode: WebhookStatus;

  constructor(code: ShopifyWebhookRequestError['code'], statusCode: WebhookStatus) {
    super('The Shopify webhook could not be accepted.');
    this.name = 'ShopifyWebhookRequestError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface AuthenticatedShopifyComplianceWebhook {
  rawBodyHash: string;
  topic: ShopifyComplianceTopic;
  shopDomain: string;
  shopId: string | null;
  webhookId: string;
  eventId: string | null;
  apiVersion: string | null;
  triggeredAt: Date | null;
}

function boundedHeader(value: string | null, maximum = 255): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function parseTriggeredAt(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJsonObject(rawBody: Uint8Array): Record<string, unknown> {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(rawBody);
    const parsed: unknown = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Expected an object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
  }
}

export async function readShopifyWebhookBody(
  request: Request,
  maximumBytes = MAX_SHOPIFY_WEBHOOK_BODY_BYTES,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_TOO_LARGE', 413);
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
      if (length > maximumBytes) {
        await reader.cancel();
        throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_TOO_LARGE', 413);
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

export function authenticateShopifyComplianceWebhook(
  input: {
    rawBody: Uint8Array;
    headers: Headers;
    apiSecret: string;
  },
): AuthenticatedShopifyComplianceWebhook {
  if (!verifyShopifyWebhookHmac(
    input.rawBody,
    input.headers.get('x-shopify-hmac-sha256'),
    input.apiSecret,
  )) {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_UNAUTHORIZED', 401);
  }

  const contentType = input.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'application/json') {
    throw new ShopifyWebhookRequestError(
      'SHOPIFY_WEBHOOK_UNSUPPORTED_MEDIA',
      415,
    );
  }

  const topic = boundedHeader(input.headers.get('x-shopify-topic'));
  if (!SHOPIFY_COMPLIANCE_TOPICS.includes(topic as ShopifyComplianceTopic)) {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
  }
  const webhookId = boundedHeader(input.headers.get('x-shopify-webhook-id'));
  const shopHeader = boundedHeader(input.headers.get('x-shopify-shop-domain'));
  if (!webhookId || !shopHeader) {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(shopHeader);
  } catch {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
  }

  const payload = parseJsonObject(input.rawBody);
  if (typeof payload.shop_domain === 'string') {
    try {
      if (normalizeShopDomain(payload.shop_domain) !== shopDomain) {
        throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
      }
    } catch (error) {
      if (error instanceof ShopifyWebhookRequestError) throw error;
      throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
    }
  }
  const rawShopId = payload.shop_id;
  const shopId = typeof rawShopId === 'string' || typeof rawShopId === 'number'
    ? String(rawShopId)
    : null;
  if (shopId && !/^\d{1,20}$/u.test(shopId)) {
    throw new ShopifyWebhookRequestError('SHOPIFY_WEBHOOK_INVALID', 400);
  }

  return {
    rawBodyHash: createHash('sha256').update(input.rawBody).digest('hex'),
    topic: topic as ShopifyComplianceTopic,
    shopDomain,
    shopId,
    webhookId,
    eventId: boundedHeader(input.headers.get('x-shopify-event-id')),
    apiVersion: boundedHeader(input.headers.get('x-shopify-api-version'), 20),
    triggeredAt: parseTriggeredAt(boundedHeader(
      input.headers.get('x-shopify-triggered-at'),
      100,
    )),
  };
}
