import { z } from 'zod';
import type {
  ShopifyChangeReviewPayload,
  ShopifyReviewDecision,
} from './review-types.ts';

export const reviewDecisionInputSchema = z.object({
  version: z.number().int().positive(),
  decisions: z.record(z.enum(['USE_LISTINGPILOT', 'KEEP_SHOPIFY', 'SKIP'])),
}).strict();

export function validateReviewDecisions(
  review: ShopifyChangeReviewPayload,
  untrusted: unknown,
): Record<string, ShopifyReviewDecision> {
  const input = reviewDecisionInputSchema.parse(untrusted);
  const fields = new Map(review.fields.map((field) => [field.fieldPath, field]));
  for (const [path, decision] of Object.entries(input.decisions)) {
    const field = fields.get(path);
    if (!field || !field.availableDecisions.includes(decision)) {
      throw new Error('INVALID_DECISION');
    }
  }
  return input.decisions;
}

