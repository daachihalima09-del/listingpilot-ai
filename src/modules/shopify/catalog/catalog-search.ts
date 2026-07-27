import type { z } from 'zod';
import type { catalogListInputSchema } from './catalog-validation.ts';

type CatalogListInput = z.infer<typeof catalogListInputSchema>;

function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, '\\$&').replace(/[\u0000-\u001F\u007F]/g, ' ')}"`;
}

export function buildShopifyCatalogSearch(input: CatalogListInput): string | null {
  const clauses: string[] = [];
  if (input.search) {
    if (/^[1-9]\d{0,19}$/.test(input.search)) {
      clauses.push(`id:${input.search}`);
    } else {
      clauses.push(`title:${quoted(input.search)} OR sku:${quoted(input.search)}`);
    }
  }
  if (input.status) clauses.push(`status:${input.status.toLowerCase()}`);
  if (input.vendor) clauses.push(`vendor:${quoted(input.vendor)}`);
  if (input.productType) clauses.push(`product_type:${quoted(input.productType)}`);
  return clauses.length ? clauses.map((clause) => `(${clause})`).join(' AND ') : null;
}

