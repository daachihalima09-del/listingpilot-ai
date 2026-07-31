import { createHash } from 'node:crypto';
import type { ShopifyProductSnapshot } from '../catalog/snapshot.ts';
import { stripExternalHtml } from '../catalog/snapshot.ts';

export type ComparableValues = Map<string, {
  label: string;
  resourceType: 'PRODUCT' | 'VARIANT' | 'METAFIELD' | 'MEDIA';
  resourceId: string | null;
  value: unknown;
  publishable: boolean;
  warningCodes?: string[];
  blocked?: boolean;
}>;

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n?/g, '\n');
}

export function normalizeTags(tags: string[] | string): string[] {
  const values = Array.isArray(tags) ? tags : tags.split(',');
  return [...new Map(values.map((tag) => [tag.trim().toLowerCase(), tag.trim()]))
    .values()].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function normalizeMoney(value: string | null): string | null {
  if (value === null || value === '') return null;
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const decimals = (match[2] ?? '').replace(/0+$/, '');
  return `${BigInt(match[1]).toString()}${decimals ? `.${decimals}` : ''}`;
}

export function comparableSnapshot(snapshot: ShopifyProductSnapshot): ComparableValues {
  const product = snapshot.product;
  const values: ComparableValues = new Map();
  const add = (
    path: string,
    label: string,
    value: unknown,
    publishable = true,
    warningCodes: string[] = [],
  ) => values.set(path, {
    label,
    resourceType: 'PRODUCT',
    resourceId: product.id,
    value,
    publishable,
    warningCodes,
  });
  add('product.title', 'Title', normalizeText(product.title));
  add('product.descriptionHtml', 'Description', stripExternalHtml(product.descriptionHtml));
  add('product.vendor', 'Vendor', normalizeText(product.vendor));
  add('product.productType', 'Product type', normalizeText(product.productType));
  add('product.tags', 'Tags', normalizeTags(product.tags));
  add('product.status', 'Product status', product.status, true, ['STOREFRONT_VISIBILITY']);
  add('product.seo.title', 'SEO title', normalizeText(product.seo.title));
  add('product.seo.description', 'SEO description', normalizeText(product.seo.description));

  for (const variant of product.variants) {
    const prefix = `variants.${variant.id}`;
    for (const [key, label, value] of [
      ['title', 'Variant title', normalizeText(variant.title)],
      ['sku', 'SKU', normalizeText(variant.sku)],
      ['barcode', 'Barcode', normalizeText(variant.barcode)],
      ['price', 'Price', normalizeMoney(variant.price)],
      ['compareAtPrice', 'Compare-at price', normalizeMoney(variant.compareAtPrice)],
      ['selectedOptions', 'Selected options', variant.selectedOptions],
      ['position', 'Variant order', variant.position],
    ] as const) {
      values.set(`${prefix}.${key}`, {
        label,
        resourceType: 'VARIANT',
        resourceId: variant.id,
        value,
        publishable: ['sku', 'barcode', 'price', 'compareAtPrice'].includes(key),
        blocked: ['selectedOptions', 'position'].includes(key),
        warningCodes: key === 'sku'
          ? ['VARIANT_SKU']
          : ['price', 'compareAtPrice'].includes(key)
            ? ['VARIANT_PRICE']
            : [],
      });
    }
  }
  for (const metafield of product.metafields) {
    values.set(`metafields.${metafield.namespace}.${metafield.key}`, {
      label: `${metafield.namespace}.${metafield.key}`,
      resourceType: 'METAFIELD',
      resourceId: null,
      value: { type: metafield.type, value: metafield.value },
      publishable: true,
    });
  }
  for (const media of product.media) {
    values.set(`media.${media.id}.alt`, {
      label: 'Image alt text',
      resourceType: 'MEDIA',
      resourceId: media.id,
      value: media.alt,
      publishable: media.type === 'IMAGE',
    });
    values.set(`media.${media.id}.identity`, {
      label: 'Media identity',
      resourceType: 'MEDIA',
      resourceId: media.id,
      value: media.url,
      publishable: false,
      blocked: true,
    });
  }
  return values;
}

export function remoteFingerprint(snapshot: ShopifyProductSnapshot): string {
  return createHash('sha256')
    .update(JSON.stringify([...comparableSnapshot(snapshot)]), 'utf8')
    .digest('hex');
}
