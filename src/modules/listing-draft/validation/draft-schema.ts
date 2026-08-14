import { z } from 'zod';
import { LISTING_DRAFT_SCHEMA_VERSION, LISTING_DRAFT_VERSION } from '../domain/contracts.ts';

const factIdsSchema = z.array(z.string().min(1)).max(100).superRefine((values, context) => {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Fact references must be unique.' });
  }
});

const textFieldSchema = z.object({
  value: z.string().max(100_000),
  factIds: factIdsSchema,
}).strict();

const specificationSchema = textFieldSchema.extend({
  label: z.string().trim().min(1).max(200),
}).strict();

const metafieldSchema = textFieldSchema.extend({
  namespace: z.string().trim().min(1).max(255),
  key: z.string().trim().min(1).max(255),
  type: z.string().trim().min(1).max(100),
}).strict();

const mediaSchema = z.object({
  imageReference: z.string().trim().min(1).max(2_048),
  altText: z.string().max(1_000),
  factIds: factIdsSchema,
}).strict();

export const draftReviewTabs = ['LISTING', 'REVIEW', 'ADVANCED'] as const;
export const draftReviewSections = [
  'TITLE', 'OVERVIEW', 'SPECIFICATIONS', 'FEATURES', 'SEO', 'CATALOG', 'METAFIELDS', 'MEDIA',
] as const;
export const draftRegenerationSections = ['TITLE', 'DESCRIPTION', 'FEATURES', 'SEO'] as const;

const reviewWorkspaceSchema = z.object({
  lockedFields: z.array(z.string().min(1).max(200)).max(250),
  reviewedSections: z.array(z.enum(draftReviewSections)).max(draftReviewSections.length),
  editedFields: z.array(z.string().min(1).max(200)).max(250),
  traceability: z.array(z.object({
    fieldKey: z.string().min(1).max(200),
    label: z.string().min(1).max(200),
    factIds: factIdsSchema,
    source: z.string().min(1).max(500),
    confidence: z.number().int().min(0).max(100),
    rule: z.string().min(1).max(1_000),
    merchantProfile: z.string().min(1).max(1_000),
    productIntelligence: z.string().min(1).max(1_000),
  }).strict()).max(250),
  facts: z.array(z.object({
    factId: z.string().min(1).max(200),
    fieldId: z.string().min(1).max(200).optional(),
    label: z.string().min(1).max(200),
    value: z.string().max(10_000),
    source: z.string().min(1).max(500),
    confidence: z.number().int().min(0).max(100),
    status: z.string().min(1).max(100),
    truthStatus: z.string().min(1).max(100).optional(),
    allowedUses: z.array(z.string().min(1).max(100)).max(50),
    sourceAuthority: z.object({
      category: z.string().min(1).max(100),
      displayLabel: z.string().min(1).max(100),
      authorityLevel: z.string().min(1).max(100),
      verificationStatus: z.string().min(1).max(100),
      limitations: z.array(z.string().max(500)).max(10),
    }).strict().optional(),
  }).strict()).max(250),
  comparison: z.object({
    section: z.enum(draftRegenerationSections),
    previous: z.string().max(200_000),
    current: z.string().max(200_000),
    changedFields: z.array(z.string().min(1).max(200)).max(250),
    merchantEditedFields: z.array(z.string().min(1).max(200)).max(250),
    createdAt: z.string().datetime(),
  }).strict().nullable(),
  advanced: z.object({
    localization: z.array(z.string().max(1_000)).max(100),
    publishingConstraints: z.array(z.string().max(1_000)).max(100),
    aiPolicySummary: z.array(z.string().max(1_000)).max(100),
  }).strict(),
  policy: z.object({
    titleMaximum: z.number().int().positive().max(10_000),
    seoTitleMaximum: z.number().int().positive().max(10_000),
    seoDescriptionMaximum: z.number().int().positive().max(20_000),
    prohibitedTerms: z.array(z.string().min(1).max(500)).max(250),
    lockedHandle: z.string().max(2_048).nullable(),
  }).strict(),
  craft: z.object({
    packId: z.string().min(1).max(64),
    packVersion: z.string().min(1).max(64),
    displayName: z.string().min(1).max(100),
    status: z.enum(['PASS', 'PASS_WITH_WARNINGS', 'REVIEW_REQUIRED', 'REJECTED']),
    findings: z.array(z.object({
      code: z.string().min(1).max(100), severity: z.enum(['INFO', 'WARNING', 'REVIEW', 'ERROR']),
      section: z.enum(['TITLE', 'SPECIFICATIONS', 'OVERVIEW', 'FEATURES', 'SEO', 'CROSS_SECTION']),
      field: z.string().max(200), message: z.string().min(1).max(1_000), relatedFactIds: factIdsSchema,
      craftRuleId: z.string().min(1).max(200), craftPackId: z.string().min(1).max(64), craftPackVersion: z.string().min(1).max(64),
      reviewRequired: z.boolean(), suggestedResolution: z.string().min(1).max(1_000),
    }).strict()).max(250),
    explanations: z.array(z.string().min(1).max(500)).max(100),
    featureTargetCount: z.number().int().min(1).max(30).optional(),
    rules: z.record(z.unknown()),
  }).strict().optional(),
}).strict();

export const listingDraftProviderOutputSchema = z.object({
  title: textFieldSchema,
  overview: textFieldSchema,
  specifications: z.array(specificationSchema).max(100),
  features: z.array(textFieldSchema).max(30),
  whatsIncluded: z.array(textFieldSchema).max(50),
  seo: z.object({
    title: textFieldSchema,
    description: textFieldSchema,
    handle: textFieldSchema,
  }).strict(),
  catalog: z.object({
    tags: z.array(textFieldSchema).max(100),
    collections: z.array(textFieldSchema).max(100),
    productType: textFieldSchema,
    vendor: textFieldSchema,
  }).strict(),
  metafields: z.array(metafieldSchema).max(100),
  media: z.array(mediaSchema).max(100),
  reviewNotes: z.array(z.string().trim().min(1).max(2_000)).max(100),
  confidence: z.object({
    overall: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1).max(2_000),
    fieldNotes: z.array(z.string().trim().min(1).max(2_000)).max(100),
  }).strict(),
}).strict();

export const listingDraftSchema = listingDraftProviderOutputSchema.extend({
  draftId: z.string().min(1),
  schemaVersion: z.literal(LISTING_DRAFT_SCHEMA_VERSION),
  draftVersion: z.literal(LISTING_DRAFT_VERSION),
  projectId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceInstructionFingerprint: z.string().min(1),
  providerRequestId: z.string().nullable(),
  status: z.enum(['GENERATED', 'EDITED', 'SAVED']),
  warnings: z.array(z.string().max(2_000)).max(100),
  productTruthSummary: z.array(z.string().max(2_000)).max(100),
  aiDetectiveSummary: z.array(z.string().max(2_000)).max(100),
  reviewWorkspace: reviewWorkspaceSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.object({
    generationStatus: z.string().min(1),
    selectedFactCount: z.number().int().nonnegative(),
    merchantEdited: z.boolean(),
    listingStandardId: z.string().min(1).max(100).optional(),
    listingProfileVersion: z.number().int().nonnegative().optional(),
    listingProfileFingerprint: z.string().min(1).max(256).optional(),
    descriptionStructure: z.enum(['SPECIFICATIONS_FIRST', 'OVERVIEW_FIRST', 'BALANCED']).optional(),
    styleComplianceStatus: z.enum(['PASS', 'PASS_WITH_WARNINGS', 'REVIEW_REQUIRED', 'REJECTED']).optional(),
    styleFindingCount: z.number().int().nonnegative().optional(),
    craftPackId: z.string().min(1).max(64).optional(),
    craftPackVersion: z.string().min(1).max(64).optional(),
    craftComplianceStatus: z.enum(['PASS', 'PASS_WITH_WARNINGS', 'REVIEW_REQUIRED', 'REJECTED']).optional(),
    craftFindingSummary: z.object({ errors: z.number().int().nonnegative(), reviews: z.number().int().nonnegative(), warnings: z.number().int().nonnegative(), information: z.number().int().nonnegative() }).strict().optional(),
  }).strict(),
}).strict();

export type ListingDraftInput = z.infer<typeof listingDraftSchema>;
export type ListingDraftProviderOutputInput = z.infer<typeof listingDraftProviderOutputSchema>;

const textFieldJsonSchema = {
  type: 'object',
  properties: {
    value: { type: 'string' },
    factIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['value', 'factIds'],
  additionalProperties: false,
} as const;

export const listingDraftProviderJsonSchema = {
  type: 'object',
  properties: {
    title: textFieldJsonSchema,
    overview: textFieldJsonSchema,
    specifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          factIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['label', 'value', 'factIds'],
        additionalProperties: false,
      },
    },
    features: { type: 'array', items: textFieldJsonSchema },
    whatsIncluded: { type: 'array', items: textFieldJsonSchema },
    seo: {
      type: 'object',
      properties: {
        title: textFieldJsonSchema,
        description: textFieldJsonSchema,
        handle: textFieldJsonSchema,
      },
      required: ['title', 'description', 'handle'],
      additionalProperties: false,
    },
    catalog: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: textFieldJsonSchema },
        collections: { type: 'array', items: textFieldJsonSchema },
        productType: textFieldJsonSchema,
        vendor: textFieldJsonSchema,
      },
      required: ['tags', 'collections', 'productType', 'vendor'],
      additionalProperties: false,
    },
    metafields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          namespace: { type: 'string' },
          key: { type: 'string' },
          type: { type: 'string' },
          value: { type: 'string' },
          factIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['namespace', 'key', 'type', 'value', 'factIds'],
        additionalProperties: false,
      },
    },
    media: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          imageReference: { type: 'string' },
          altText: { type: 'string' },
          factIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['imageReference', 'altText', 'factIds'],
        additionalProperties: false,
      },
    },
    reviewNotes: { type: 'array', items: { type: 'string' } },
    confidence: {
      type: 'object',
      properties: {
        overall: { type: 'integer', minimum: 0, maximum: 100 },
        summary: { type: 'string' },
        fieldNotes: { type: 'array', items: { type: 'string' } },
      },
      required: ['overall', 'summary', 'fieldNotes'],
      additionalProperties: false,
    },
  },
  required: [
    'title', 'overview', 'specifications', 'features', 'whatsIncluded',
    'seo', 'catalog', 'metafields', 'media', 'reviewNotes', 'confidence',
  ],
  additionalProperties: false,
} as const;
