import { z } from 'zod';

const optionalUrlSchema = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().url().optional(),
);

export const serverEnvSchema = z.object({
  DATABASE_URL: z.string().url().refine(
    (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'DATABASE_URL must use the PostgreSQL protocol.',
  ),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: optionalUrlSchema,
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
}).strict();

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    AUTH_SECRET: source.AUTH_SECRET,
    AUTH_URL: source.AUTH_URL,
    NODE_ENV: source.NODE_ENV,
  });

  if (!result.success) {
    const invalidKeys = [...new Set(
      result.error.issues.map((issue) => String(issue.path[0] ?? 'environment')),
    )];
    throw new Error(`Invalid server environment configuration: ${invalidKeys.join(', ')}`);
  }

  return result.data;
}
