import { z } from 'zod';

export const projectStatuses = ['DRAFT', 'READY', 'ARCHIVED'] as const;
export const projectSourceTypes = [
  'RAW_SPECIFICATIONS',
  'SUPPLIER_URL',
  'PRODUCT_URL',
  'UPLOADED_PDF',
] as const;
export const pipelineStages = [
  'input',
  'extract',
  'verify',
  'generate',
  'review',
  'export',
] as const;

const uuidSchema = z.string().uuid();
const projectNameSchema = z
  .string()
  .trim()
  .min(2, 'Project name must be at least 2 characters.')
  .max(200, 'Project name must be 200 characters or fewer.')
  .refine(
    (value) => !/[\u0000-\u001F\u007F]/.test(value),
    'Project name cannot contain control characters.',
  );

const nullableHttpUrlSchema = z
  .string()
  .trim()
  .max(2_048, 'Source URL must be 2,048 characters or fewer.')
  .refine((value) => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol)
        && !url.username
        && !url.password
        && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, 'Source URL must be a valid HTTP or HTTPS URL without credentials.')
  .nullable();

const nullableRawInputSchema = z
  .string()
  .max(100_000, 'Source input is too large.')
  .nullable();

const truthRowSchema = z.object({
  field: z.string().max(200),
  value: z.string().max(10_000),
  source: z.string().max(2_048),
  sourcesCount: z.number().int().min(0).max(10_000),
  confidence: z.number().int().min(0).max(100),
  status: z.enum(['Verified', 'Conflict', 'Likely', 'Missing']),
  reasoning: z.string().max(20_000).optional(),
}).strict();

const sourceEvidenceSchema = z.object({
  name: z.string().max(2_048),
  type: z.string().max(200),
  confidence: z.number().int().min(0).max(100),
  status: z.enum(['Official', 'Retailer', 'Review']),
}).strict();

const activeProductSchema = z.object({
  brand: z.string().max(1_000),
  model: z.string().max(1_000),
  panel: z.string().max(1_000),
  hdr: z.string().max(1_000),
  refreshRate: z.string().max(1_000),
  resolution: z.string().max(1_000),
  smartPlatform: z.string().max(1_000),
  warranty: z.string().max(10_000),
  truthRows: z.array(truthRowSchema).max(100),
  sources: z.array(sourceEvidenceSchema).max(100),
  conflict: z.object({
    label: z.string().max(1_000),
    official: z.string().max(10_000),
    amazon: z.string().max(10_000),
    lg: z.string().max(10_000),
    recommendation: z.string().max(20_000),
    recommendedValue: z.string().max(10_000),
    explanation: z.string().max(50_000),
  }).strict(),
  catalogHealth: z.object({
    score: z.number().int().min(0).max(100),
    label: z.string().max(200),
    items: z.array(z.object({
      name: z.string().max(500),
      status: z.enum(['good', 'warning', 'review']),
    }).strict()).max(100),
  }).strict(),
  analyses: z.array(z.object({
    title: z.string().max(1_000),
    status: z.string().max(200),
    score: z.number().int().min(0).max(100),
  }).strict()).max(100),
}).strict();

export const projectAnalysisDataSchema = z.object({
  activeProduct: activeProductSchema,
  truthRows: z.array(truthRowSchema).max(100),
  analysisContext: z.object({
    sourceLabel: z.enum([
      'Raw specifications',
      'Supplier URL',
      'Product URL',
      'Uploaded PDF',
    ]),
    notice: z.string().max(10_000),
  }).strict().nullable(),
  conflictResolved: z.boolean(),
}).strict();

export const projectGeneratedListingSchema = z.object({
  title: z.string().max(10_000),
  description: z.string().max(100_000),
  keyFeatures: z.string().max(50_000),
}).strict();

export const projectSeoDataSchema = z.object({
  seoTitle: z.string().max(10_000),
  seoDescription: z.string().max(20_000),
  tags: z.string().max(20_000),
}).strict();

export const projectReadinessDataSchema = z.object({
  analysisStarted: z.boolean(),
  activeStage: z.enum(pipelineStages),
  completedStages: z.array(z.enum(pipelineStages)).max(pipelineStages.length),
  shopifyReady: z.boolean(),
}).strict();

const projectIdentitySchema = z.object({
  workspaceId: uuidSchema,
  projectId: uuidSchema,
}).strict();

const versionedProjectIdentitySchema = projectIdentitySchema.extend({
  version: z.number().int().positive(),
}).strict();

export const createProjectSchema = z.object({
  workspaceId: uuidSchema,
  name: projectNameSchema,
  sourceType: z.enum(projectSourceTypes).nullable().optional().default(null),
  sourceUrl: nullableHttpUrlSchema.optional().default(null),
  rawInput: nullableRawInputSchema.optional().default(null),
}).strict();

export const listProjectsSchema = z.object({
  workspaceId: uuidSchema,
  archived: z.boolean().optional().default(false),
}).strict();

export const getProjectSchema = projectIdentitySchema;

export const renameProjectSchema = versionedProjectIdentitySchema.extend({
  name: projectNameSchema,
}).strict();

export const projectLifecycleSchema = versionedProjectIdentitySchema;

export const saveProjectStateSchema = versionedProjectIdentitySchema.extend({
  sourceType: z.enum(projectSourceTypes).nullable(),
  sourceUrl: nullableHttpUrlSchema,
  rawInput: nullableRawInputSchema,
  analysisData: projectAnalysisDataSchema.nullable(),
  generatedListing: projectGeneratedListingSchema.nullable(),
  seoData: projectSeoDataSchema.nullable(),
  readinessData: projectReadinessDataSchema.nullable(),
}).strict();

export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectSourceType = (typeof projectSourceTypes)[number];
export type ProjectAnalysisData = z.infer<typeof projectAnalysisDataSchema>;
export type ProjectGeneratedListing = z.infer<typeof projectGeneratedListingSchema>;
export type ProjectSeoData = z.infer<typeof projectSeoDataSchema>;
export type ProjectReadinessData = z.infer<typeof projectReadinessDataSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsSchema>;
export type GetProjectInput = z.infer<typeof getProjectSchema>;
export type RenameProjectInput = z.infer<typeof renameProjectSchema>;
export type ProjectLifecycleInput = z.infer<typeof projectLifecycleSchema>;
export type SaveProjectStateInput = z.infer<typeof saveProjectStateSchema>;
