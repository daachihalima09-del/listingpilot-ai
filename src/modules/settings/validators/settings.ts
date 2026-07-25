import { z } from 'zod';

const tenantNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(200, 'Name must be 200 characters or fewer.')
  .refine(
    (value) => !/[\u0000-\u001F\u007F]/.test(value),
    'Name cannot contain control characters.',
  );

export const organizationUpdateSchema = z.object({
  organizationId: z.string().uuid('Organization ID is invalid.'),
  name: tenantNameSchema,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Slug must be at least 2 characters.')
    .max(100, 'Slug must be 100 characters or fewer.')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug may contain lowercase letters, numbers, and single hyphens.',
    ),
}).strict();

export const workspaceUpdateSchema = z.object({
  workspaceId: z.string().uuid('Workspace ID is invalid.'),
  name: tenantNameSchema,
}).strict();

export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateSchema>;
