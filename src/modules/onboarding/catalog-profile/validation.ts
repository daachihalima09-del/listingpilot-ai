import { z } from 'zod';
import type {
  MerchantCatalogProfileDto,
  MerchantCatalogProfileRecord,
  MerchantCatalogProfileValues,
} from './types.ts';

export const merchantCatalogSetupModeSchema = z.enum([
  'SHOPIFY_IMPORT',
  'MANUAL',
]);

export function normalizeMerchantCatalogValue(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function merchantCatalogComparisonKey(value: string): string {
  return normalizeMerchantCatalogValue(value).toLocaleLowerCase('en-US');
}

const merchantCatalogValueSchema = z.string()
  .transform(normalizeMerchantCatalogValue)
  .pipe(z.string()
    .min(1, 'Remove empty values before saving.')
    .max(255, 'Catalog values must be 255 characters or fewer.'));

function uniqueCatalogValuesSchema(label: string) {
  return z.array(merchantCatalogValueSchema).superRefine((values, context) => {
    const seen = new Map<string, number>();
    values.forEach((value, index) => {
      const key = merchantCatalogComparisonKey(value);
      const existing = seen.get(key);
      if (existing !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ${label} are not allowed.`,
          path: [index],
        });
      } else {
        seen.set(key, index);
      }
    });
  });
}

export const merchantCatalogProfileInputSchema = z.object({
  setupMode: merchantCatalogSetupModeSchema,
  collections: uniqueCatalogValuesSchema('collections'),
  productTypes: uniqueCatalogValuesSchema('product types'),
  vendors: uniqueCatalogValuesSchema('vendors'),
}).strict();

export const merchantCatalogWorkspaceSelectionSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict();

export type MerchantCatalogProfileInput = z.output<
  typeof merchantCatalogProfileInputSchema
>;

export function profileRecordToDto(
  profile: MerchantCatalogProfileRecord,
): MerchantCatalogProfileDto {
  const values: MerchantCatalogProfileValues = {
    collections: [],
    productTypes: [],
    vendors: [],
  };
  const orderedEntries = [...profile.entries].sort(
    (left, right) => left.position - right.position,
  );
  for (const entry of orderedEntries) {
    if (entry.kind === 'COLLECTION') values.collections.push(entry.value);
    if (entry.kind === 'PRODUCT_TYPE') values.productTypes.push(entry.value);
    if (entry.kind === 'VENDOR') values.vendors.push(entry.value);
  }
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    setupMode: profile.setupMode,
    version: profile.version,
    completedAt: profile.completedAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    ...values,
  };
}
