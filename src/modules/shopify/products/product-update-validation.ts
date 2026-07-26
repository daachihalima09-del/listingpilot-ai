import { z } from 'zod';

export const shopifyProductIdSchema = z.string().regex(
  /^[1-9]\d{0,19}$/,
  'Enter a valid Shopify product ID.',
);

const clearableText = z.string().trim().max(255);

export const shopifyProductUpdateInputSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  descriptionHtml: z.string().max(100_000).optional(),
  vendor: clearableText.optional(),
  productType: clearableText.optional(),
  tags: z.array(z.string().trim().min(1).max(255)).max(250).optional(),
  status: z.enum(['ACTIVE', 'DRAFT']).optional(),
}).strict().refine(
  (input) => Object.values(input).some((value) => value !== undefined),
  { message: 'Provide at least one product field to update.' },
);

const shopifyProductStateSchema = z.object({
  product: z.object({
    id: z.union([
      z.string().regex(/^\d+$/),
      z.number().int().positive(),
    ]).transform(String),
    title: z.string().min(1),
    handle: z.string().min(1),
    body_html: z.string().nullable(),
    vendor: z.string(),
    product_type: z.string(),
    tags: z.string(),
    status: z.enum(['active', 'draft']),
    updated_at: z.string().datetime({ offset: true }).optional(),
  }).passthrough(),
}).passthrough();

export type ShopifyProductUpdateInput =
  z.infer<typeof shopifyProductUpdateInputSchema>;

export interface ShopifyProductState {
  id: string;
  title: string;
  handle: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: 'ACTIVE' | 'DRAFT';
  updatedAt: string | null;
}

export function parseShopifyProductState(
  untrustedResponse: unknown,
): ShopifyProductState {
  const result = shopifyProductStateSchema.parse(untrustedResponse).product;
  return {
    id: result.id,
    title: result.title,
    handle: result.handle,
    descriptionHtml: result.body_html ?? '',
    vendor: result.vendor,
    productType: result.product_type,
    tags: result.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    status: result.status.toUpperCase() as 'ACTIVE' | 'DRAFT',
    updatedAt: result.updated_at ?? null,
  };
}
