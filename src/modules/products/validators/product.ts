import { z } from 'zod';
import {
  projectAnalysisDataSchema,
  projectGeneratedListingSchema,
  projectReadinessDataSchema,
  projectSeoDataSchema,
  projectSourceTypes,
} from '../../projects/validators/project.ts';

const uuid = z.string().uuid();
const productName = z.string().trim().min(2).max(200).refine(
  (value) => !/[\u0000-\u001F\u007F]/.test(value),
  'Product name cannot contain control characters.',
);
const optionalCatalogDefault = z.string().trim().max(255).transform((value) => value || null).nullable().optional().default(null);
const editableCatalogValue = z.string().trim().max(255).transform((value) => value || null).nullable().optional();
const sourceUrl = z.string().trim().max(2_048).url().refine((value) => {
  const parsed = new URL(value);
  return ['http:', 'https:'].includes(parsed.protocol)
    && !parsed.username
    && !parsed.password;
}, 'Source URL must be a valid HTTP or HTTPS URL without credentials.').nullable();

export const productIdentitySchema = z.object({
  workspaceId: uuid,
  projectId: uuid,
  productId: uuid,
}).strict();

export const listProductsSchema = z.object({
  workspaceId: uuid,
  projectId: uuid,
  archived: z.boolean().optional().default(false),
}).strict();

export const createProductSchema = z.object({
  workspaceId: uuid,
  projectId: uuid,
  name: productName,
  productType: optionalCatalogDefault,
  collection: optionalCatalogDefault,
}).strict();

export const renameProductSchema = productIdentitySchema.extend({
  name: productName,
  productType: editableCatalogValue,
  collection: editableCatalogValue,
  version: z.number().int().positive(),
}).strict();

export const saveProductStateSchema = productIdentitySchema.extend({
  version: z.number().int().positive(),
  sourceType: z.enum(projectSourceTypes).nullable(),
  sourceUrl,
  rawInput: z.string().max(100_000).nullable(),
  analysisData: projectAnalysisDataSchema.nullable(),
  generatedListing: projectGeneratedListingSchema.nullable(),
  seoData: projectSeoDataSchema.nullable(),
  readinessData: projectReadinessDataSchema.nullable(),
}).strict();

export const productLifecycleSchema = productIdentitySchema.extend({
  version: z.number().int().positive(),
}).strict();
