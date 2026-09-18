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
  VERCEL: z.string().optional(),
}).strict().superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') {
    return;
  }

  const isVercelDeployment = value.VERCEL === '1';

  if (!value.AUTH_URL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_URL'],
      message: 'AUTH_URL is required in production.',
    });
    return;
  }

  const authUrl = new URL(value.AUTH_URL);
  const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(authUrl.hostname);
  if (authUrl.protocol !== 'https:' && (!isLocalhost || isVercelDeployment)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_URL'],
      message: 'AUTH_URL must use HTTPS outside a local production build.',
    });
  } else if (isVercelDeployment && isLocalhost) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AUTH_URL'],
      message: 'AUTH_URL must be a public HTTPS URL on Vercel.',
    });
  }
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    AUTH_SECRET: source.AUTH_SECRET,
    AUTH_URL: source.AUTH_URL,
    NODE_ENV: source.NODE_ENV,
    VERCEL: source.VERCEL,
  });

  if (!result.success) {
    const invalidKeys = [...new Set(
      result.error.issues.map((issue) => String(issue.path[0] ?? 'environment')),
    )];
    throw new Error(`Invalid server environment configuration: ${invalidKeys.join(', ')}`);
  }

  return result.data;
}
