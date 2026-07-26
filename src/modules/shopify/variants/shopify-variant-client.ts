'use client';

import { z } from 'zod';
import type {
  ShopifyVariantConfigurationDto,
  ShopifyVariantConfigurationRequest,
} from './variant-validation.ts';

const configurationDtoSchema = z.object({
  version: z.number().int().nonnegative(),
  options: z.array(z.object({
    name: z.string(),
    values: z.array(z.string()),
  }).strict()).max(3),
  variants: z.array(z.object({
    optionValues: z.array(z.object({
      name: z.string(),
      value: z.string(),
    }).strict()).max(3),
    price: z.string(),
    compareAtPrice: z.string().nullable(),
    sku: z.string().nullable(),
    barcode: z.string().nullable(),
    published: z.boolean(),
    firstPublishedAt: z.string().datetime({ offset: true }).nullable(),
    lastPublishedAt: z.string().datetime({ offset: true }).nullable(),
  }).strict()).max(2_048),
}).strict();

const saveResponseSchema = z.object({
  configuration: configurationDtoSchema,
}).strict();

const publishResponseSchema = z.object({
  outcome: z.enum(['PUBLISHED', 'UNCHANGED', 'PARTIAL']),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  unmanagedRemote: z.number().int().nonnegative(),
  currencyCode: z.string().length(3).nullable(),
  message: z.string(),
  configuration: configurationDtoSchema,
}).strict();

export type ShopifyVariantPublishClientResult =
  z.infer<typeof publishResponseSchema>;

export class ShopifyVariantClientError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ShopifyVariantClientError';
    this.code = code;
  }
}

const friendlyErrors: Record<string, string> = {
  AUTH_UNAUTHENTICATED: 'Sign in again before managing Shopify variants.',
  SHOPIFY_VARIANT_FORBIDDEN: 'Store-owner permission is required to manage variants.',
  SHOPIFY_VARIANT_PROJECT_NOT_FOUND: 'This project is no longer available.',
  SHOPIFY_VARIANT_PROJECT_ARCHIVED: 'Restore this project before changing variants.',
  SHOPIFY_VARIANT_PRODUCT_NOT_LINKED: 'Publish the Shopify product before publishing variants.',
  SHOPIFY_VARIANT_CONFIGURATION_MISSING: 'Shopify publishing is not configured.',
  SHOPIFY_VARIANT_CONFIG_CONFLICT: 'A newer configuration exists. Refresh before saving.',
  SHOPIFY_VARIANT_OPTION_CONFLICT: 'Shopify has options that ListingPilot will preserve. Review the product in Shopify Admin.',
  SHOPIFY_VARIANT_NOT_FOUND: 'The linked Shopify product or variant was not found.',
  SHOPIFY_VARIANT_VALIDATION_FAILED: 'Shopify rejected the variant configuration.',
  SHOPIFY_VARIANT_RATE_LIMITED: 'Shopify is busy. Wait a moment and try again.',
  SHOPIFY_VARIANT_TIMEOUT: 'Shopify took too long to respond. Try again.',
};

export function friendlyShopifyVariantError(code: unknown): string {
  return typeof code === 'string' && friendlyErrors[code]
    ? friendlyErrors[code]
    : 'The Shopify variant operation could not be completed.';
}

async function responsePayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ShopifyVariantClientError(
      'Shopify returned an unexpected response.',
      'MALFORMED_RESPONSE',
    );
  }
}

function errorCode(payload: unknown): string {
  return (
    payload
    && typeof payload === 'object'
    && 'error' in payload
    && payload.error
    && typeof payload.error === 'object'
    && 'code' in payload.error
    && typeof payload.error.code === 'string'
  ) ? payload.error.code : 'VARIANT_OPERATION_FAILED';
}

export function createShopifyVariantClient(request: typeof fetch = fetch) {
  let pending: Promise<unknown> | null = null;

  async function once<T>(operation: () => Promise<T>): Promise<T> {
    if (pending) return pending as Promise<T>;
    pending = operation().finally(() => {
      pending = null;
    });
    return pending as Promise<T>;
  }

  return {
    save(
      projectId: string,
      configuration: ShopifyVariantConfigurationRequest,
    ): Promise<ShopifyVariantConfigurationDto> {
      return once(async () => {
        let response: Response;
        try {
          response = await request(
            `/api/projects/${encodeURIComponent(projectId)}/shopify-variants`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(configuration),
            },
          );
        } catch {
          throw new ShopifyVariantClientError(
            'The variant configuration could not be saved.',
            'NETWORK_FAILURE',
          );
        }
        const payload = await responsePayload(response);
        if (!response.ok) {
          const code = errorCode(payload);
          throw new ShopifyVariantClientError(
            friendlyShopifyVariantError(code),
            code,
          );
        }
        const parsed = saveResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new ShopifyVariantClientError(
            'Shopify returned an unexpected response.',
            'MALFORMED_RESPONSE',
          );
        }
        return parsed.data.configuration;
      });
    },

    publish(projectId: string): Promise<ShopifyVariantPublishClientResult> {
      return once(async () => {
        let response: Response;
        try {
          response = await request(
            `/api/projects/${encodeURIComponent(projectId)}/shopify-variants/publish`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            },
          );
        } catch {
          throw new ShopifyVariantClientError(
            'Shopify variants could not be published. Check your connection.',
            'NETWORK_FAILURE',
          );
        }
        const payload = await responsePayload(response);
        if (!response.ok) {
          const code = errorCode(payload);
          throw new ShopifyVariantClientError(
            friendlyShopifyVariantError(code),
            code,
          );
        }
        const parsed = publishResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new ShopifyVariantClientError(
            'Shopify returned an unexpected response.',
            'MALFORMED_RESPONSE',
          );
        }
        return parsed.data;
      });
    },
  };
}
