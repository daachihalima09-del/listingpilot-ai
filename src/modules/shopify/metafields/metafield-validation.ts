import { z } from 'zod';
import {
  getMetafieldCatalogDefinition,
  SHOPIFY_METAFIELD_CATALOG,
  type MetafieldCatalogDefinition,
  type ShopifyMetafieldType,
} from './metafield-catalog.ts';

const unsafeSingleLine = /[\u0000-\u001F\u007F]/;
const unsafeMultiLine = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
export const shopifyMetafieldNamespaceSchema = z.string()
  .min(3).max(255).regex(/^[A-Za-z0-9_-]+$/);
export const shopifyMetafieldKeySchema = z.string()
  .min(2).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const metafieldConfigurationInputSchema = z.object({
  version: z.number().int().min(0),
  fields: z.array(z.object({
    catalogId: z.string(),
    enabled: z.boolean(),
  }).strict()).length(SHOPIFY_METAFIELD_CATALOG.length),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  for (const [index, field] of input.fields.entries()) {
    if (!getMetafieldCatalogDefinition(field.catalogId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields', index, 'catalogId'],
        message: 'Unknown metafield catalog identifier.',
      });
    }
    if (seen.has(field.catalogId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields', index, 'catalogId'],
        message: 'Duplicate metafield catalog identifier.',
      });
    }
    seen.add(field.catalogId);
  }
});

export function deterministicJson(value: unknown): string {
  function normalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    if (typeof input === 'number' && !Number.isFinite(input)) {
      throw new Error('JSON contains a non-finite number.');
    }
    return input;
  }
  return JSON.stringify(normalize(value));
}

function parseText(value: unknown, multiline: boolean, maxLength: number) {
  const parsed = z.string().min(1).max(maxLength).parse(value);
  if ((multiline ? unsafeMultiLine : unsafeSingleLine).test(parsed)) {
    throw new Error('Metafield text contains unsupported control characters.');
  }
  return parsed;
}

export function normalizeMetafieldValue(
  definition: Pick<MetafieldCatalogDefinition, 'type' | 'maxLength'>,
  value: unknown,
): string {
  const maxLength = definition.maxLength
    ?? (definition.type === 'multi_line_text_field' ? 65_535 : 255);
  switch (definition.type) {
    case 'single_line_text_field':
      return parseText(value, false, maxLength);
    case 'multi_line_text_field':
      return parseText(value, true, maxLength);
    case 'list.single_line_text_field': {
      const raw = typeof value === 'string' ? JSON.parse(value) : value;
      const items = z.array(z.string()).max(128).parse(raw);
      const seen = new Set<string>();
      const normalized = items.flatMap((item) => {
        const clean = parseText(item.trim(), false, 255);
        const identity = clean.toLocaleLowerCase('en-US');
        if (seen.has(identity)) return [];
        seen.add(identity);
        return [clean];
      });
      if (!normalized.length) throw new Error('Metafield list is empty.');
      return JSON.stringify(normalized);
    }
    case 'number_integer': {
      const parsed = z.string().regex(/^-?(?:0|[1-9]\d*)$/).parse(value);
      const numeric = BigInt(parsed);
      if (
        numeric > BigInt(Number.MAX_SAFE_INTEGER)
        || numeric < BigInt(Number.MIN_SAFE_INTEGER)
      ) throw new Error('Metafield integer is outside the safe range.');
      return parsed;
    }
    case 'number_decimal':
      return z.string()
        .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
        .max(64)
        .parse(value);
    case 'date_time': {
      const parsed = z.string().datetime({ offset: true }).parse(value);
      return new Date(parsed).toISOString();
    }
    case 'json': {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return deterministicJson(parsed);
    }
    default:
      throw new Error(`Unsupported metafield type: ${definition.type satisfies never}`);
  }
}

export function validateCatalogIdentity(input: {
  catalogId: string;
  namespace: string;
  key: string;
  type: string;
}): MetafieldCatalogDefinition {
  shopifyMetafieldNamespaceSchema.parse(input.namespace);
  shopifyMetafieldKeySchema.parse(input.key);
  const definition = getMetafieldCatalogDefinition(input.catalogId);
  if (
    !definition
    || definition.namespace !== input.namespace
    || definition.key !== input.key
    || definition.type !== input.type
  ) throw new Error('Metafield identity is not in the approved catalog.');
  return definition;
}

export function isShopifyMetafieldType(value: string): value is ShopifyMetafieldType {
  return SHOPIFY_METAFIELD_CATALOG.some(({ type }) => type === value);
}

export type MetafieldConfigurationInput = z.infer<
  typeof metafieldConfigurationInputSchema
>;
