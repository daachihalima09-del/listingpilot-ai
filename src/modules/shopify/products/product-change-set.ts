import type {
  ShopifyProductState,
  ShopifyProductUpdateInput,
} from './product-update-validation.ts';

export type ShopifyProductUpdateField = keyof ShopifyProductUpdateInput;

export interface ShopifyProductUpdatePayload {
  product: {
    id: string;
    title?: string;
    body_html?: string;
    vendor?: string;
    product_type?: string;
    tags?: string;
    status?: 'active' | 'draft';
  };
}

function normalizeTags(tags: string[]): string[] {
  const tagsByKey = new Map<string, string>();
  for (const tag of tags) {
    const normalized = tag.trim();
    const key = normalized.toLocaleLowerCase('en-US');
    if (normalized && !tagsByKey.has(key)) tagsByKey.set(key, normalized);
  }
  return [...tagsByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
    .map(([, tag]) => tag);
}

function comparableTags(tags: string[]): string[] {
  return normalizeTags(tags).map((tag) => tag.toLocaleLowerCase('en-US'));
}

function hasField(
  input: ShopifyProductUpdateInput,
  field: ShopifyProductUpdateField,
): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

export function calculateShopifyProductChangeSet(
  current: ShopifyProductState,
  requested: ShopifyProductUpdateInput,
): {
  changedFields: ShopifyProductUpdateField[];
  payload: ShopifyProductUpdatePayload;
} {
  const changedFields: ShopifyProductUpdateField[] = [];
  const product: ShopifyProductUpdatePayload['product'] = { id: current.id };

  if (
    hasField(requested, 'title')
    && requested.title !== undefined
    && requested.title !== current.title
  ) {
    changedFields.push('title');
    product.title = requested.title;
  }
  if (
    hasField(requested, 'descriptionHtml')
    && requested.descriptionHtml !== undefined
    && requested.descriptionHtml !== current.descriptionHtml
  ) {
    changedFields.push('descriptionHtml');
    product.body_html = requested.descriptionHtml;
  }
  if (
    hasField(requested, 'vendor')
    && requested.vendor !== undefined
    && requested.vendor !== current.vendor
  ) {
    changedFields.push('vendor');
    product.vendor = requested.vendor;
  }
  if (
    hasField(requested, 'productType')
    && requested.productType !== undefined
    && requested.productType !== current.productType
  ) {
    changedFields.push('productType');
    product.product_type = requested.productType;
  }
  if (hasField(requested, 'tags') && requested.tags) {
    const requestedTags = normalizeTags(requested.tags);
    if (
      JSON.stringify(comparableTags(requestedTags))
      !== JSON.stringify(comparableTags(current.tags))
    ) {
      changedFields.push('tags');
      product.tags = requestedTags.join(', ');
    }
  }
  if (
    hasField(requested, 'status')
    && requested.status !== undefined
    && requested.status !== current.status
  ) {
    changedFields.push('status');
    product.status = requested.status.toLowerCase() as 'active' | 'draft';
  }

  return {
    changedFields,
    payload: { product },
  };
}
