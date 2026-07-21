import { z } from 'zod';

export const listingDraftSchema = z.object({
  productName: z.string().min(1),
  supplierNotes: z.string().optional(),
  reviewStatus: z.enum(['draft', 'review', 'approved']),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;
