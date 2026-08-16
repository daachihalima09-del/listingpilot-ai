import { z } from 'zod';

export const productImageIdentitySchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  productId: z.string().uuid(),
}).strict();

export const importSourceImagesSchema = productImageIdentitySchema.extend({
  sourceImageIds: z.array(z.string().uuid()).min(1).max(20),
}).strict();

export type ProductImageIdentity = z.infer<typeof productImageIdentitySchema>;
export type ImportSourceImagesInput = z.infer<typeof importSourceImagesSchema>;

/** Keep the strict authorization boundary limited to tenant identity fields. */
export function identityFromImportInput(input: ImportSourceImagesInput): ProductImageIdentity {
  return productImageIdentitySchema.parse({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    productId: input.productId,
  });
}
