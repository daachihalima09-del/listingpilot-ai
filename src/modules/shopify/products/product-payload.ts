import type { ShopifyProductCreateInput } from './product-validation.ts';

export interface ShopifyProductCreatePayload {
  product: {
    title: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    tags: string;
    status: 'active' | 'draft';
  };
}

export function buildShopifyProductCreatePayload(
  input: ShopifyProductCreateInput,
): ShopifyProductCreatePayload {
  return {
    product: {
      title: input.title,
      ...(input.descriptionHtml === undefined
        ? {}
        : { body_html: input.descriptionHtml }),
      ...(input.vendor === undefined ? {} : { vendor: input.vendor }),
      ...(input.productType === undefined
        ? {}
        : { product_type: input.productType }),
      tags: input.tags.join(', '),
      status: input.status.toLowerCase() as 'active' | 'draft',
    },
  };
}
