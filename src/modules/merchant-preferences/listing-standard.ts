import { z } from 'zod';

export const listingStandardIds = [
  'LEARN_FROM_STORE',
  'NEOVIX',
  'MARKETPLACE',
  'ELECTRONICS_RETAIL',
  'LUXURY_RETAIL',
  'MINIMAL',
  'CUSTOM',
] as const;

export const listingStandardIdSchema = z.enum(listingStandardIds);
export type ListingStandardId = z.infer<typeof listingStandardIdSchema>;

export const titleFieldIds = [
  'BRAND',
  'PRODUCT_TYPE',
  'MODEL',
  'SIZE_OR_CAPACITY',
  'TECHNOLOGY',
] as const;

export const listingRulesSchema = z.object({
  title: z.object({
    fieldOrder: z.array(z.enum(titleFieldIds)).min(1).max(5)
      .superRefine((values, context) => {
        if (new Set(values).size !== values.length) {
          context.addIssue({ code: z.ZodIssueCode.custom, message: 'Title fields must be unique.' });
        }
      }),
    characterLimit: z.number().int().min(30).max(200),
    separator: z.enum(['SPACE', 'DASH', 'PIPE', 'COLON']),
    capitalization: z.enum(['TITLE_CASE', 'SENTENCE_CASE', 'UPPERCASE']),
    prohibitPromotionalWords: z.boolean(),
  }).strict(),
  description: z.object({
    structure: z.enum(['SPECIFICATIONS_FIRST', 'OVERVIEW_FIRST', 'BALANCED']),
    paragraphCount: z.number().int().min(1).max(6),
    tone: z.enum(['PROFESSIONAL', 'TECHNICAL', 'PREMIUM', 'CONVERSATIONAL', 'MINIMAL']),
    technicalLevel: z.enum(['MINIMAL', 'BALANCED', 'DETAILED']),
    includeUseCases: z.boolean(),
    includeBuyingAdvice: z.boolean(),
  }).strict(),
  features: z.object({
    count: z.number().int().min(1).max(20),
    maximumLength: z.number().int().min(20).max(300),
    technicalFirst: z.boolean(),
    customerBenefits: z.boolean(),
    displayOrder: z.enum(['TECHNICAL_FIRST', 'BENEFITS_FIRST', 'BALANCED']),
  }).strict(),
  requiredInformation: z.array(z.string().trim().min(1).max(100)).max(20)
    .superRefine((values, context) => {
      const normalized = values.map((value) => value.toLocaleLowerCase('en-US'));
      if (new Set(normalized).size !== normalized.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Required information fields must be unique.' });
      }
    }),
  prohibitedContent: z.array(z.string().trim().min(1).max(100)).max(50)
    .superRefine((values, context) => {
      const normalized = values.map((value) => value.toLocaleLowerCase('en-US'));
      if (new Set(normalized).size !== normalized.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Prohibited words and phrases must be unique.' });
      }
    }),
}).strict();

export type ListingRules = z.infer<typeof listingRulesSchema>;

export const listingProfileDataSchema = z.object({
  standardId: listingStandardIdSchema,
  learningMode: z.enum(['LEARN_FROM_STORE', 'STANDARD']),
  analysisStatus: z.enum(['PENDING_ANALYSIS', 'NOT_REQUIRED']),
  configurationStatus: z.enum(['STANDARD_SELECTED', 'CONFIGURED']),
  rules: listingRulesSchema.nullable(),
}).strict().superRefine((data, context) => {
  if (data.standardId === 'LEARN_FROM_STORE') {
    if (data.learningMode !== 'LEARN_FROM_STORE' || data.analysisStatus !== 'PENDING_ANALYSIS' || data.rules !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Learn From My Store must remain pending analysis without manual rules.' });
    }
    return;
  }
  if (data.learningMode !== 'STANDARD' || data.analysisStatus !== 'NOT_REQUIRED') {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Built-in listing standards require standard configuration.' });
  }
  if (data.configurationStatus === 'CONFIGURED' && data.rules === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Configure listing rules before saving.' });
  }
});

export type ListingPreferenceData = z.infer<typeof listingProfileDataSchema>;

const baseRules = (overrides: Partial<ListingRules> = {}): ListingRules => ({
  title: {
    fieldOrder: ['BRAND', 'PRODUCT_TYPE', 'MODEL'],
    characterLimit: 120,
    separator: 'SPACE',
    capitalization: 'TITLE_CASE',
    prohibitPromotionalWords: true,
  },
  description: {
    structure: 'SPECIFICATIONS_FIRST',
    paragraphCount: 2,
    tone: 'PROFESSIONAL',
    technicalLevel: 'BALANCED',
    includeUseCases: false,
    includeBuyingAdvice: false,
  },
  features: {
    count: 8,
    maximumLength: 140,
    technicalFirst: true,
    customerBenefits: true,
    displayOrder: 'TECHNICAL_FIRST',
  },
  requiredInformation: ['Model Number', 'Brand'],
  prohibitedContent: ['Best', 'Perfect', 'Cheapest'],
  ...overrides,
});

export interface ListingStandardDefinition {
  readonly id: ListingStandardId;
  readonly name: string;
  readonly description: string;
  readonly badge?: string;
  readonly learningMode: ListingPreferenceData['learningMode'];
  readonly defaults: ListingRules | null;
}

export const listingStandards: readonly ListingStandardDefinition[] = Object.freeze([
  { id: 'LEARN_FROM_STORE', name: 'Learn From My Store', description: 'Prepare ListingPilot to learn your established catalog in a future analysis sprint.', badge: 'Recommended', learningMode: 'LEARN_FROM_STORE', defaults: null },
  { id: 'NEOVIX', name: 'NEOVIX Standard', description: 'A specification-first standard for structured, premium Shopify listings.', badge: 'Recommended for Electronics', learningMode: 'STANDARD', defaults: baseRules({ title: { fieldOrder: ['BRAND', 'MODEL', 'PRODUCT_TYPE', 'SIZE_OR_CAPACITY', 'TECHNOLOGY'], characterLimit: 140, separator: 'SPACE', capitalization: 'TITLE_CASE', prohibitPromotionalWords: true }, description: { structure: 'SPECIFICATIONS_FIRST', paragraphCount: 2, tone: 'PROFESSIONAL', technicalLevel: 'DETAILED', includeUseCases: false, includeBuyingAdvice: false }, features: { count: 10, maximumLength: 120, technicalFirst: true, customerBenefits: true, displayOrder: 'TECHNICAL_FIRST' }, requiredInformation: ['Model Number', 'Brand', 'Type', 'Capacity', 'Key Technologies'], prohibitedContent: ['Best', 'Perfect', 'Cheapest'] }) },
  { id: 'MARKETPLACE', name: 'Marketplace Standard', description: 'Keyword-aware, feature-driven listings suited to multi-marketplace merchants.', learningMode: 'STANDARD', defaults: baseRules({ description: { structure: 'OVERVIEW_FIRST', paragraphCount: 3, tone: 'PROFESSIONAL', technicalLevel: 'BALANCED', includeUseCases: true, includeBuyingAdvice: false }, features: { count: 10, maximumLength: 150, technicalFirst: false, customerBenefits: true, displayOrder: 'BENEFITS_FIRST' } }) },
  { id: 'ELECTRONICS_RETAIL', name: 'Electronics Retail Standard', description: 'Clean technical listings with concise professional descriptions.', learningMode: 'STANDARD', defaults: baseRules({ title: { fieldOrder: ['BRAND', 'PRODUCT_TYPE', 'MODEL', 'SIZE_OR_CAPACITY', 'TECHNOLOGY'], characterLimit: 130, separator: 'SPACE', capitalization: 'TITLE_CASE', prohibitPromotionalWords: true }, description: { structure: 'SPECIFICATIONS_FIRST', paragraphCount: 2, tone: 'TECHNICAL', technicalLevel: 'DETAILED', includeUseCases: false, includeBuyingAdvice: false } }) },
  { id: 'LUXURY_RETAIL', name: 'Luxury Retail Standard', description: 'Premium presentation with elegant descriptions and focused specifications.', learningMode: 'STANDARD', defaults: baseRules({ title: { fieldOrder: ['BRAND', 'PRODUCT_TYPE', 'MODEL'], characterLimit: 110, separator: 'SPACE', capitalization: 'TITLE_CASE', prohibitPromotionalWords: true }, description: { structure: 'OVERVIEW_FIRST', paragraphCount: 2, tone: 'PREMIUM', technicalLevel: 'BALANCED', includeUseCases: true, includeBuyingAdvice: false }, features: { count: 6, maximumLength: 130, technicalFirst: false, customerBenefits: true, displayOrder: 'BENEFITS_FIRST' } }) },
  { id: 'MINIMAL', name: 'Minimal Standard', description: 'Compact listings for quick publishing and smaller catalogs.', learningMode: 'STANDARD', defaults: baseRules({ title: { fieldOrder: ['BRAND', 'PRODUCT_TYPE', 'MODEL'], characterLimit: 80, separator: 'SPACE', capitalization: 'TITLE_CASE', prohibitPromotionalWords: true }, description: { structure: 'OVERVIEW_FIRST', paragraphCount: 1, tone: 'MINIMAL', technicalLevel: 'MINIMAL', includeUseCases: false, includeBuyingAdvice: false }, features: { count: 4, maximumLength: 90, technicalFirst: false, customerBenefits: true, displayOrder: 'BALANCED' }, requiredInformation: ['Brand'], prohibitedContent: [] }) },
  { id: 'CUSTOM', name: 'Custom Standard', description: 'Start with a blank profile and configure every writing rule yourself.', learningMode: 'STANDARD', defaults: null },
]);

export function getListingStandard(id: ListingStandardId): ListingStandardDefinition {
  const standard = listingStandards.find((candidate) => candidate.id === id);
  if (!standard) throw new Error(`Unsupported listing standard: ${id}`);
  return standard;
}

export function createListingProfileForStandard(
  standardId: ListingStandardId,
): ListingPreferenceData {
  const standard = getListingStandard(standardId);
  return {
    standardId,
    learningMode: standard.learningMode,
    analysisStatus: standard.learningMode === 'LEARN_FROM_STORE'
      ? 'PENDING_ANALYSIS'
      : 'NOT_REQUIRED',
    configurationStatus: standard.learningMode === 'LEARN_FROM_STORE'
      ? 'CONFIGURED'
      : 'STANDARD_SELECTED',
    rules: standard.defaults ? structuredClone(standard.defaults) : null,
  };
}
