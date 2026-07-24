import { z } from 'zod';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]));

export const createAuditLogSchema = z.object({
  organizationId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  action: z.string().trim().min(1).max(150),
  entityType: z.string().trim().min(1).max(100).nullable().optional(),
  entityId: z.string().trim().min(1).max(255).nullable().optional(),
  ipAddress: z.string().trim().min(1).max(45).nullable().optional(),
  userAgent: z.string().trim().min(1).max(2_000).nullable().optional(),
  metadata: jsonValueSchema.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.metadata !== undefined && JSON.stringify(value.metadata).length > 16_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata'],
      message: 'Audit metadata exceeds the maximum size.',
    });
  }
});

export type CreateAuditLogInput = z.input<typeof createAuditLogSchema>;
export type ValidatedAuditLogInput = z.output<typeof createAuditLogSchema>;
