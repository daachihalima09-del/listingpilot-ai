import { z } from 'zod';

export const SHOPIFY_MAX_PRODUCT_OPTIONS = 3;
export const SHOPIFY_MAX_PRODUCT_VARIANTS = 2_048;

export const shopifyMoneySchema = z.string()
  .trim()
  .regex(
    /^(?:0|[1-9]\d{0,19})(?:\.\d{1,2})?$/,
    'Use a non-negative decimal amount with no more than two decimal places.',
  );

const optionalText = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === ''
    ? null
    : value,
  z.string()
    .trim()
    .max(255)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
      message: 'Control characters are not allowed.',
    })
    .nullable()
    .optional()
    .default(null),
);

const optionValueSchema = z.string()
  .trim()
  .min(1, 'Option values cannot be empty.')
  .max(255);

const optionSchema = z.object({
  name: z.string().trim().min(1, 'Option names cannot be empty.').max(255),
  values: z.array(optionValueSchema).min(1).max(SHOPIFY_MAX_PRODUCT_VARIANTS),
}).strict();

const variantOptionValueSchema = z.object({
  name: z.string().trim().min(1).max(255),
  value: z.string().trim().min(1).max(255),
}).strict();

const variantSchema = z.object({
  optionValues: z.array(variantOptionValueSchema)
    .max(SHOPIFY_MAX_PRODUCT_OPTIONS),
  price: shopifyMoneySchema,
  compareAtPrice: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === ''
      ? null
      : value,
    shopifyMoneySchema.nullable().optional().default(null),
  ),
  sku: optionalText,
  barcode: optionalText,
}).strict();

function normalizedKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function decimalParts(value: string): [string, string] {
  const [whole, fraction = ''] = value.split('.');
  return [whole.replace(/^0+(?=\d)/, ''), fraction.padEnd(2, '0')];
}

export function compareDecimalStrings(left: string, right: string): number {
  const [leftWhole, leftFraction] = decimalParts(left);
  const [rightWhole, rightFraction] = decimalParts(right);
  if (leftWhole.length !== rightWhole.length) {
    return leftWhole.length > rightWhole.length ? 1 : -1;
  }
  if (leftWhole !== rightWhole) return leftWhole > rightWhole ? 1 : -1;
  if (leftFraction === rightFraction) return 0;
  return leftFraction > rightFraction ? 1 : -1;
}

export function buildVariantCombinationKey(
  optionValues: Array<{ name: string; value: string }>,
): string {
  if (optionValues.length === 0) return '__default__';
  return optionValues
    .map(({ name, value }) => `${normalizedKey(name)}=${normalizedKey(value)}`)
    .join('\u001f');
}

export const shopifyVariantConfigurationSchema = z.object({
  version: z.number().int().nonnegative(),
  options: z.array(optionSchema).max(
    SHOPIFY_MAX_PRODUCT_OPTIONS,
    `Shopify supports at most ${SHOPIFY_MAX_PRODUCT_OPTIONS} product options.`,
  ),
  variants: z.array(variantSchema).min(1).max(SHOPIFY_MAX_PRODUCT_VARIANTS),
}).strict().superRefine((configuration, context) => {
  const optionNames = new Set<string>();
  for (const [optionIndex, option] of configuration.options.entries()) {
    const nameKey = normalizedKey(option.name);
    if (optionNames.has(nameKey)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options', optionIndex, 'name'],
        message: 'Option names must be unique.',
      });
    }
    optionNames.add(nameKey);

    const values = new Set<string>();
    for (const [valueIndex, value] of option.values.entries()) {
      const valueKey = normalizedKey(value);
      if (values.has(valueKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options', optionIndex, 'values', valueIndex],
          message: 'Values within an option must be unique.',
        });
      }
      values.add(valueKey);
    }
  }

  if (configuration.options.length === 0 && configuration.variants.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['variants'],
      message: 'A product without options must have exactly one variant.',
    });
  }

  const combinations = new Set<string>();
  for (const [variantIndex, variant] of configuration.variants.entries()) {
    if (
      variant.compareAtPrice
      && compareDecimalStrings(variant.compareAtPrice, variant.price) <= 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', variantIndex, 'compareAtPrice'],
        message: 'Compare-at price must be greater than price.',
      });
    }

    if (variant.optionValues.length !== configuration.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variants', variantIndex, 'optionValues'],
        message: 'Every variant must provide one value for every option.',
      });
      continue;
    }

    const orderedValues: Array<{ name: string; value: string }> = [];
    for (const [optionIndex, option] of configuration.options.entries()) {
      const selected = variant.optionValues.find(
        ({ name }) => normalizedKey(name) === normalizedKey(option.name),
      );
      if (
        !selected
        || !option.values.some(
          (value) => normalizedKey(value) === normalizedKey(selected.value),
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', variantIndex, 'optionValues', optionIndex],
          message: `Select a valid value for ${option.name}.`,
        });
        continue;
      }
      orderedValues.push({
        name: option.name,
        value: option.values.find(
          (value) => normalizedKey(value) === normalizedKey(selected.value),
        ) ?? selected.value,
      });
    }

    if (orderedValues.length === configuration.options.length) {
      const combination = buildVariantCombinationKey(orderedValues);
      if (combinations.has(combination)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants', variantIndex, 'optionValues'],
          message: 'Variant combinations must be unique.',
        });
      }
      combinations.add(combination);
    }
  }
}).transform((configuration) => ({
  version: configuration.version,
  options: configuration.options.map((option) => ({
    name: option.name,
    values: [...option.values],
  })),
  variants: configuration.variants.map((variant) => {
    const optionValues = configuration.options.map((option) => {
      const selected = variant.optionValues.find(
        ({ name }) => normalizedKey(name) === normalizedKey(option.name),
      );
      return {
        name: option.name,
        value: option.values.find(
          (value) => normalizedKey(value) === normalizedKey(selected?.value ?? ''),
        ) ?? selected?.value ?? '',
      };
    });
    return {
      ...variant,
      optionValues,
      combinationKey: buildVariantCombinationKey(optionValues),
    };
  }),
}));

export const shopifyVariantProjectIdSchema = z.string().uuid();

export type ShopifyVariantConfigurationInput =
  z.infer<typeof shopifyVariantConfigurationSchema>;
export type ShopifyVariantConfigurationRequest =
  z.input<typeof shopifyVariantConfigurationSchema>;

export interface ShopifyVariantConfigurationDto {
  version: number;
  options: Array<{
    name: string;
    values: string[];
  }>;
  variants: Array<{
    optionValues: Array<{ name: string; value: string }>;
    price: string;
    compareAtPrice: string | null;
    sku: string | null;
    barcode: string | null;
    published: boolean;
    firstPublishedAt: string | null;
    lastPublishedAt: string | null;
  }>;
}
