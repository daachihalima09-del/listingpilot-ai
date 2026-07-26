'use client';

import { z } from 'zod';
import type { ShopifyMappedProduct } from './listing-mapping.ts';

const publicationResponseSchema = z.object({
  outcome: z.enum([
    'CREATED',
    'UPDATED',
    'UNCHANGED',
    'LINK_PENDING',
    'RECOVERED',
  ]),
  publication: z.object({
    id: z.string().regex(/^[1-9]\d{0,19}$/),
    title: z.string().min(1).max(255),
    handle: z.string().max(255).nullable(),
    status: z.enum(['ACTIVE', 'DRAFT']),
    firstPublishedAt: z.string().datetime({ offset: true }),
    lastPublishedAt: z.string().datetime({ offset: true }),
  }).strict(),
  changed: z.boolean(),
  changedFields: z.array(z.string().max(100)).max(20),
  recoveryReceipt: z.string().max(8_192).optional(),
  adminUrl: z.string().url().nullable(),
}).strict();

export type ShopifyPublicationClientResult =
  z.infer<typeof publicationResponseSchema>;

export class ShopifyPublicationClientError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
  ) {
    super(message);
    this.name = 'ShopifyPublicationClientError';
    this.code = code;
  }
}

const friendlyErrors: Record<string, string> = {
  AUTH_UNAUTHENTICATED: 'Sign in again before publishing to Shopify.',
  SHOPIFY_PUBLICATION_FORBIDDEN: 'Store-owner permission is required to publish to Shopify.',
  SHOPIFY_PUBLICATION_NOT_FOUND: 'This project is no longer available.',
  SHOPIFY_CONFIGURATION_MISSING: 'Shopify publishing is not configured.',
  SHOPIFY_PRODUCT_STORE_NOT_CONNECTED: 'Connect a Shopify store before publishing.',
  SHOPIFY_PRODUCT_REAUTHORIZATION_REQUIRED: 'Reconnect Shopify before publishing.',
  SHOPIFY_PRODUCT_VALIDATION_FAILED: 'Shopify rejected the listing details. Review them and try again.',
  SHOPIFY_PRODUCT_RATE_LIMITED: 'Shopify is busy. Wait a moment and try again.',
  SHOPIFY_PRODUCT_TIMEOUT: 'Shopify took too long to respond. Try again.',
  SHOPIFY_PRODUCT_NOT_FOUND: 'The linked Shopify product no longer exists.',
  SHOPIFY_PUBLICATION_RECOVERY_INVALID: 'The previous publish could not be recovered safely. Refresh this page.',
};

export function friendlyShopifyPublicationError(
  code: unknown,
): string {
  return typeof code === 'string' && friendlyErrors[code]
    ? friendlyErrors[code]
    : 'The Shopify publish could not be completed. Your listing is unchanged.';
}

export function safeShopifyAdminUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:'
      && url.hostname.endsWith('.myshopify.com')
      && /^\/admin\/products\/[1-9]\d{0,19}$/.test(url.pathname)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
    ) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createShopifyPublicationClient(
  request: typeof fetch = fetch,
) {
  let pending: Promise<ShopifyPublicationClientResult> | null = null;

  return {
    publish(input: {
      projectId: string;
      mode: 'create' | 'update';
      product: ShopifyMappedProduct;
      recoveryReceipt?: string;
    }): Promise<ShopifyPublicationClientResult> {
      if (pending) return pending;

      pending = (async () => {
        let response: Response;
        try {
          response = await request(
            `/api/projects/${encodeURIComponent(input.projectId)}/shopify-publication`,
            {
              method: input.mode === 'create' ? 'POST' : 'PATCH',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                product: input.product,
                ...(input.recoveryReceipt
                  ? { recoveryReceipt: input.recoveryReceipt }
                  : {}),
              }),
            },
          );
        } catch {
          throw new ShopifyPublicationClientError(
            'The Shopify publish could not be completed. Check your connection and try again.',
            'NETWORK_FAILURE',
          );
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ShopifyPublicationClientError(
            'Shopify returned an unexpected response. Try again.',
            'MALFORMED_RESPONSE',
          );
        }
        if (!response.ok) {
          const code = (
            payload
            && typeof payload === 'object'
            && 'error' in payload
            && payload.error
            && typeof payload.error === 'object'
            && 'code' in payload.error
          ) ? payload.error.code : undefined;
          throw new ShopifyPublicationClientError(
            friendlyShopifyPublicationError(code),
            typeof code === 'string' ? code : 'PUBLISH_FAILED',
          );
        }

        const parsed = publicationResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new ShopifyPublicationClientError(
            'Shopify returned an unexpected response. Try again.',
            'MALFORMED_RESPONSE',
          );
        }
        return parsed.data;
      })().finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}
