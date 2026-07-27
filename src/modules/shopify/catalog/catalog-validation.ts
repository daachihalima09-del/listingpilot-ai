import { z } from 'zod';

export const shopifyProductGidSchema = z.string().regex(
  /^gid:\/\/shopify\/Product\/[1-9]\d{0,19}$/,
);
export const catalogCursorSchema = z.string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9+/=_:-]+$/);
export const catalogSearchSchema = z.string().trim().max(100);
export const catalogListInputSchema = z.object({
  search: catalogSearchSchema.optional().default(''),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).optional(),
  vendor: z.string().trim().max(100).optional(),
  productType: z.string().trim().max(100).optional(),
  importState: z.enum(['ALL', 'IMPORTED', 'NOT_IMPORTED']).default('ALL'),
  cursor: catalogCursorSchema.optional(),
}).strict();
export const catalogImportInputSchema = z.object({
  productId: shopifyProductGidSchema,
}).strict();

export function encodeShopifyProductReference(gid: string): string {
  return Buffer.from(shopifyProductGidSchema.parse(gid)).toString('base64url');
}

export function decodeShopifyProductReference(reference: string): string {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(reference)) {
    throw new Error('Invalid product reference.');
  }
  return shopifyProductGidSchema.parse(
    Buffer.from(reference, 'base64url').toString('utf8'),
  );
}

