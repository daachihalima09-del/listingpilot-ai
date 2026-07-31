import { z } from 'zod';
import { SHOPIFY_METAFIELD_CATALOG_BY_ID } from '../metafields/metafield-catalog.ts';

const gid = z.string().min(1).max(255);
const money = z.string().regex(/^\d+(?:\.\d+)?$/).max(32);
export const shopifyProductSnapshotSchema = z.object({
  schemaVersion: z.literal('1'),
  apiVersion: z.string().max(20),
  importedAt: z.string().datetime(),
  product: z.object({
    id: gid,
    legacyResourceId: z.string().regex(/^[1-9]\d{0,19}$/),
    title: z.string().max(255),
    handle: z.string().max(255),
    descriptionHtml: z.string().max(100_000),
    vendor: z.string().max(255),
    productType: z.string().max(255),
    status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
    tags: z.array(z.string().max(255)).max(250),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    publishedAt: z.string().datetime().nullable(),
    seo: z.object({
      title: z.string().max(10_000).nullable(),
      description: z.string().max(20_000).nullable(),
    }),
    options: z.array(z.object({
      id: gid,
      name: z.string().max(255),
      position: z.number().int().positive(),
      values: z.array(z.string().max(255)).max(100),
    })).max(3),
    variants: z.array(z.object({
      id: gid,
      legacyResourceId: z.string().regex(/^[1-9]\d{0,19}$/),
      title: z.string().max(255),
      sku: z.string().max(255).nullable(),
      barcode: z.string().max(255).nullable(),
      price: money,
      compareAtPrice: money.nullable(),
      position: z.number().int().positive(),
      selectedOptions: z.array(z.object({
        name: z.string().max(255),
        value: z.string().max(255),
      })).max(3),
      image: z.object({
        id: gid,
        url: z.string().url().max(2048),
        altText: z.string().max(512).nullable(),
      }).nullable(),
    })).max(100),
    media: z.array(z.object({
      type: z.string().max(50),
      id: gid,
      alt: z.string().max(512).nullable(),
      url: z.string().url().max(2048).nullable(),
    })).max(50),
    metafields: z.array(z.object({
      namespace: z.string().max(255),
      key: z.string().max(64),
      type: z.string().max(100),
      value: z.string().max(50_000),
      ownerResourceType: z.literal('PRODUCT'),
    })).max(50),
  }),
}).strict();

export type ShopifyProductSnapshot = z.infer<typeof shopifyProductSnapshotSchema>;

interface RawMetafield {
  namespace?: unknown;
  key?: unknown;
  type?: unknown;
  value?: unknown;
}

interface RawMedia {
  __typename?: unknown;
  id?: unknown;
  alt?: unknown;
  mediaContentType?: unknown;
  image?: { url?: unknown };
}

interface RawVariant {
  id?: unknown;
  legacyResourceId?: unknown;
  title?: unknown;
  sku?: unknown;
  barcode?: unknown;
  price?: unknown;
  compareAtPrice?: unknown;
  position?: unknown;
  selectedOptions?: unknown;
  image?: { id?: unknown; url?: unknown; altText?: unknown } | null;
}

interface RawProduct {
  id?: unknown;
  legacyResourceId?: unknown;
  title?: unknown;
  handle?: unknown;
  descriptionHtml?: unknown;
  vendor?: unknown;
  productType?: unknown;
  status?: unknown;
  tags?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  publishedAt?: unknown;
  seo?: { title?: unknown; description?: unknown };
  options?: unknown;
  variants?: { nodes?: RawVariant[] };
  media?: { nodes?: RawMedia[] };
  metafields?: { nodes?: RawMetafield[] };
}

function isSafeMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function stripExternalHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeShopifyProductSnapshot(
  rawInput: Record<string, unknown>,
  apiVersion: string,
  importedAt = new Date(),
): ShopifyProductSnapshot {
  const raw = rawInput as RawProduct;
  const metafields = (raw.metafields?.nodes ?? []).filter((field) => (
    typeof field.namespace === 'string'
    && typeof field.key === 'string'
    && SHOPIFY_METAFIELD_CATALOG_BY_ID.has(`${field.namespace}.${field.key}`)
  )).map((field) => ({
    namespace: field.namespace,
    key: field.key,
    type: field.type,
    value: field.value,
    ownerResourceType: 'PRODUCT' as const,
  }));
  const media = (raw.media?.nodes ?? []).map((item) => ({
    type: item.mediaContentType ?? item.__typename,
    id: item.id,
    alt: item.alt ?? null,
    url: isSafeMediaUrl(item.image?.url) ? item.image.url : null,
  }));
  const snapshot = shopifyProductSnapshotSchema.parse({
    schemaVersion: '1',
    apiVersion,
    importedAt: importedAt.toISOString(),
    product: {
      id: raw.id,
      legacyResourceId: String(raw.legacyResourceId),
      title: raw.title,
      handle: raw.handle,
      descriptionHtml: raw.descriptionHtml ?? '',
      vendor: raw.vendor ?? '',
      productType: raw.productType ?? '',
      status: raw.status,
      tags: raw.tags ?? [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      publishedAt: raw.publishedAt ?? null,
      seo: {
        title: raw.seo?.title ?? null,
        description: raw.seo?.description ?? null,
      },
      options: raw.options ?? [],
      variants: (raw.variants?.nodes ?? []).map((variant) => ({
        ...variant,
        legacyResourceId: String(variant.legacyResourceId),
        sku: variant.sku || null,
        barcode: variant.barcode || null,
        compareAtPrice: variant.compareAtPrice ?? null,
        image: variant.image && isSafeMediaUrl(variant.image.url)
          ? variant.image
          : null,
      })),
      media,
      metafields,
    },
  });
  if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > 512 * 1024) {
    throw new Error('SOURCE_SNAPSHOT_TOO_LARGE');
  }
  return snapshot;
}
