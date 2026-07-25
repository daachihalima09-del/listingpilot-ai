import { z } from 'zod';

const shopifyApiVersionSchema = z.string().regex(
  /^\d{4}-(01|04|07|10)$/,
  'SHOPIFY_API_VERSION must be a quarterly Shopify API version.',
);

const shopifyScopesSchema = z.string().transform((value, context) => {
  const scopes = [...new Set(
    value.split(',').map((scope) => scope.trim()).filter(Boolean),
  )];

  if (
    scopes.length === 0
    || scopes.some((scope) => !/^[a-z][a-z0-9_]*$/.test(scope))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SHOPIFY_SCOPES must be a comma-separated list of valid scopes.',
    });
    return z.NEVER;
  }

  return scopes;
});

const encryptionKeySchema = z.string().transform((value, context) => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SHOPIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
    });
    return z.NEVER;
  }

  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'SHOPIFY_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
    });
    return z.NEVER;
  }
  return value;
});

const shopifyConfigSchema = z.object({
  SHOPIFY_API_KEY: z.string().trim().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_APP_URL: z.string().url().transform((value, context) => {
    const url = new URL(value);
    const isLocalDevelopment = (
      url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname)
    );
    if (url.protocol !== 'https:' && !isLocalDevelopment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SHOPIFY_APP_URL must use HTTPS outside local development.',
      });
      return z.NEVER;
    }
    url.pathname = url.pathname.replace(/\/+$/, '');
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  }),
  SHOPIFY_API_VERSION: shopifyApiVersionSchema,
  SHOPIFY_SCOPES: shopifyScopesSchema,
  SHOPIFY_TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
}).strict();

export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  appUrl: string;
  apiVersion: string;
  scopes: string[];
  tokenEncryptionKey: string;
}

export function parseShopifyConfig(
  source: Record<string, string | undefined>,
): ShopifyConfig {
  const result = shopifyConfigSchema.safeParse({
    SHOPIFY_API_KEY: source.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: source.SHOPIFY_API_SECRET,
    SHOPIFY_APP_URL: source.SHOPIFY_APP_URL,
    SHOPIFY_API_VERSION: source.SHOPIFY_API_VERSION,
    SHOPIFY_SCOPES: source.SHOPIFY_SCOPES,
    SHOPIFY_TOKEN_ENCRYPTION_KEY: source.SHOPIFY_TOKEN_ENCRYPTION_KEY,
  });

  if (!result.success) {
    const invalidKeys = [...new Set(
      result.error.issues.map((issue) => String(issue.path[0] ?? 'environment')),
    )];
    throw new Error(
      `Invalid Shopify environment configuration: ${invalidKeys.join(', ')}`,
    );
  }

  return {
    apiKey: result.data.SHOPIFY_API_KEY,
    apiSecret: result.data.SHOPIFY_API_SECRET,
    appUrl: result.data.SHOPIFY_APP_URL,
    apiVersion: result.data.SHOPIFY_API_VERSION,
    scopes: result.data.SHOPIFY_SCOPES,
    tokenEncryptionKey: result.data.SHOPIFY_TOKEN_ENCRYPTION_KEY,
  };
}

export function getShopifyConfig(): ShopifyConfig {
  return parseShopifyConfig(process.env);
}

export function hasValidShopifyConfig(): boolean {
  try {
    getShopifyConfig();
    return true;
  } catch {
    return false;
  }
}
