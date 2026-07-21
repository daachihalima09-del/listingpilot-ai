import { z } from 'zod';

const analyzedProductSchema = z.object({
  brand: z.string(),
  model: z.string(),
  panel: z.string(),
  hdr: z.string(),
  refreshRate: z.string(),
  resolution: z.string(),
  smartPlatform: z.string(),
  warranty: z.string(),
}).strict();

const truthRowSchema = z.object({
  field: z.string(),
  value: z.string(),
  source: z.string(),
  sourcesCount: z.number().int().min(0),
  confidence: z.number().int().min(0).max(100),
  status: z.enum(['Verified', 'Conflict', 'Likely', 'Missing']),
  reasoning: z.string(),
}).strict();

const generatedListingSchema = z.object({
  title: z.string().min(100).max(140),
  description: z.string().min(150 * 5).max(250 * 7),
  keyFeatures: z.string().min(240),
  seoTitle: z.string(),
  seoDescription: z.string(),
  tags: z.string(),
}).strict();

const conflictSchema = z.object({
  field: z.string(),
  values: z.array(z.string()).min(2),
  recommendedValue: z.string(),
  explanation: z.string(),
  confidence: z.number().int().min(0).max(100),
}).strict();

export const productAnalysisSchema = z.object({
  product: analyzedProductSchema,
  truthRows: z.array(truthRowSchema).min(1).max(30),
  listing: generatedListingSchema,
  missingFields: z.array(z.string()),
  overallConfidence: z.number().int().min(0).max(100),
  conflict: conflictSchema.nullable(),
}).strict();

export type ProductAnalysis = z.infer<typeof productAnalysisSchema>;

export const productAnalysisJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    product: {
      type: 'object',
      additionalProperties: false,
      properties: {
        brand: { type: 'string' },
        model: { type: 'string' },
        panel: { type: 'string' },
        hdr: { type: 'string' },
        refreshRate: { type: 'string' },
        resolution: { type: 'string' },
        smartPlatform: { type: 'string' },
        warranty: { type: 'string' },
      },
      required: ['brand', 'model', 'panel', 'hdr', 'refreshRate', 'resolution', 'smartPlatform', 'warranty'],
    },
    truthRows: {
      type: 'array',
      minItems: 1,
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          value: { type: 'string' },
          source: { type: 'string' },
          sourcesCount: { type: 'integer', minimum: 0 },
          confidence: { type: 'integer', minimum: 0, maximum: 100 },
          status: { type: 'string', enum: ['Verified', 'Conflict', 'Likely', 'Missing'] },
          reasoning: { type: 'string' },
        },
        required: ['field', 'value', 'source', 'sourcesCount', 'confidence', 'status', 'reasoning'],
      },
    },
    listing: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 100, maxLength: 140 },
        description: { type: 'string', minLength: 750, maxLength: 1750 },
        keyFeatures: { type: 'string', minLength: 240 },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        tags: { type: 'string' },
      },
      required: ['title', 'description', 'keyFeatures', 'seoTitle', 'seoDescription', 'tags'],
    },
    missingFields: {
      type: 'array',
      items: { type: 'string' },
    },
    overallConfidence: { type: 'integer', minimum: 0, maximum: 100 },
    conflict: {
      anyOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string' },
            values: { type: 'array', minItems: 2, items: { type: 'string' } },
            recommendedValue: { type: 'string' },
            explanation: { type: 'string' },
            confidence: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: ['field', 'values', 'recommendedValue', 'explanation', 'confidence'],
        },
        { type: 'null' },
      ],
    },
  },
  required: ['product', 'truthRows', 'listing', 'missingFields', 'overallConfidence', 'conflict'],
} as const;
