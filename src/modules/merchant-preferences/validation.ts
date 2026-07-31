import { z } from 'zod';
import { MerchantPreferenceError } from './errors.ts';
import {
  merchantPreferenceSectionIdSchema,
  isActiveMerchantPreferenceSection,
} from './section-ids.ts';
import type {
  MerchantPreferenceSectionStatus,
} from './types.ts';

export const merchantPreferenceVersionSchema = z.number().int().positive();

export const merchantPreferenceSectionWriteSchema = z.object({
  workspaceId: z.string().uuid(),
  sectionId: merchantPreferenceSectionIdSchema,
  schemaVersion: merchantPreferenceVersionSchema,
  expectedVersion: merchantPreferenceVersionSchema.nullable(),
  source: z.enum([
    'SHOPIFY_IMPORT',
    'MANUAL',
    'MERCHANT_EDIT',
    'PLATFORM_DEFAULT',
  ]),
  payload: z.unknown(),
}).strict().superRefine((input, context) => {
  if (!isActiveMerchantPreferenceSection(input.sectionId)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Merchant preference section "${input.sectionId}" is reserved but not active.`,
      path: ['sectionId'],
    });
  }
});

const allowedStatusTransitions:
Readonly<Record<
MerchantPreferenceSectionStatus,
readonly MerchantPreferenceSectionStatus[]
>> = {
  NOT_STARTED: ['IN_PROGRESS', 'COMPLETE', 'INVALID'],
  IN_PROGRESS: ['IN_PROGRESS', 'COMPLETE', 'NEEDS_REVIEW', 'INVALID'],
  COMPLETE: ['COMPLETE', 'NEEDS_REVIEW', 'INVALID'],
  NEEDS_REVIEW: ['IN_PROGRESS', 'COMPLETE', 'NEEDS_REVIEW', 'INVALID'],
  INVALID: ['IN_PROGRESS', 'COMPLETE', 'NEEDS_REVIEW', 'INVALID'],
};

export function assertMerchantPreferenceStatusTransition(
  previous: MerchantPreferenceSectionStatus,
  next: MerchantPreferenceSectionStatus,
): void {
  if (!allowedStatusTransitions[previous].includes(next)) {
    throw new MerchantPreferenceError(
      'INVALID_COMPLETION_TRANSITION',
      409,
      `Merchant preference section cannot transition from ${previous} to ${next}.`,
    );
  }
}
