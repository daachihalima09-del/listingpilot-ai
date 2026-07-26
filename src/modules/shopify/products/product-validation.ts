import { z } from 'zod';

const optionalProductText = (maximumLength: number) => z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().trim().max(maximumLength).optional(),
);

export const shopifyProductCreateInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  descriptionHtml: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().max(100_000).optional(),
  ),
  vendor: optionalProductText(255),
  productType: optionalProductText(255),
  tags: z.array(z.string().trim().min(1).max(255)).max(250).default([]),
  status: z.enum(['ACTIVE', 'DRAFT']),
}).strict().transform((input) => ({
  ...input,
  tags: [...new Set(input.tags)],
}));

const shopifyCreatedProductSchema = z.object({
  product: z.object({
    id: z.union([
      z.string().regex(/^\d+$/),
      z.number().int().positive(),
    ]).transform(String),
    title: z.string().min(1),
    handle: z.string().min(1),
    status: z.enum(['active', 'draft']),
  }).passthrough(),
}).passthrough();

export type ShopifyProductCreateInput =
  z.infer<typeof shopifyProductCreateInputSchema>;

export interface ShopifyCreatedProduct {
  id: string;
  title: string;
  handle: string;
  status: 'ACTIVE' | 'DRAFT';
}

export function parseShopifyCreatedProduct(
  untrustedResponse: unknown,
): ShopifyCreatedProduct {
  const result = shopifyCreatedProductSchema.parse(untrustedResponse);
  return {
    id: result.product.id,
    title: result.product.title,
    handle: result.product.handle,
    status: result.product.status.toUpperCase() as 'ACTIVE' | 'DRAFT',
  };
}
