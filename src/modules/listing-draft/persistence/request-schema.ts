import { z } from 'zod';
import { listingDraftSchema } from '../validation/draft-schema.ts';
import { draftRegenerationSections } from '../validation/draft-schema.ts';

export const generateListingDraftRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  version: z.number().int().positive(),
}).strict();

export const saveListingDraftRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  version: z.number().int().positive(),
  draft: listingDraftSchema,
}).strict();

export const regenerateListingDraftRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  version: z.number().int().positive(),
  section: z.enum(draftRegenerationSections),
}).strict();
