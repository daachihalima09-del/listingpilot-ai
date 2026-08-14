import { z } from 'zod';

const factIds = z.array(z.string().min(1)).max(100);
const textField = z.object({ value: z.string().max(100_000), factIds }).strict();
const specification = textField.extend({ label: z.string().trim().min(1).max(200) }).strict();

export const partialGenerationOutputSchema = z.discriminatedUnion('section', [
  z.object({ section: z.literal('TITLE'), title: textField }).strict(),
  z.object({
    section: z.literal('DESCRIPTION'),
    overview: textField,
    specifications: z.array(specification).max(100),
    whatsIncluded: z.array(textField).max(50),
  }).strict(),
  z.object({ section: z.literal('FEATURES'), features: z.array(textField).max(30) }).strict(),
  z.object({
    section: z.literal('SEO'),
    seo: z.object({ title: textField, description: textField, handle: textField }).strict(),
  }).strict(),
]);

const textFieldJsonSchema = {
  type: 'object',
  properties: {
    value: { type: 'string' },
    factIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['value', 'factIds'],
  additionalProperties: false,
} as const;

const schemas = {
  TITLE: {
    type: 'object',
    properties: { section: { type: 'string', enum: ['TITLE'] }, title: textFieldJsonSchema },
    required: ['section', 'title'],
    additionalProperties: false,
  },
  DESCRIPTION: {
    type: 'object',
    properties: {
      section: { type: 'string', enum: ['DESCRIPTION'] },
      overview: textFieldJsonSchema,
      specifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'string' }, factIds: { type: 'array', items: { type: 'string' } } },
          required: ['label', 'value', 'factIds'],
          additionalProperties: false,
        },
      },
      whatsIncluded: { type: 'array', items: textFieldJsonSchema },
    },
    required: ['section', 'overview', 'specifications', 'whatsIncluded'],
    additionalProperties: false,
  },
  FEATURES: {
    type: 'object',
    properties: { section: { type: 'string', enum: ['FEATURES'] }, features: { type: 'array', items: textFieldJsonSchema } },
    required: ['section', 'features'],
    additionalProperties: false,
  },
  SEO: {
    type: 'object',
    properties: {
      section: { type: 'string', enum: ['SEO'] },
      seo: {
        type: 'object',
        properties: { title: textFieldJsonSchema, description: textFieldJsonSchema, handle: textFieldJsonSchema },
        required: ['title', 'description', 'handle'],
        additionalProperties: false,
      },
    },
    required: ['section', 'seo'],
    additionalProperties: false,
  },
} as const;

export function partialGenerationJsonSchema(section: keyof typeof schemas): Readonly<Record<string, unknown>> {
  return schemas[section];
}
