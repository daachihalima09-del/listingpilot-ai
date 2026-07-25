import { z } from 'zod';

const SHOPIFY_DOMAIN_SUFFIX = '.myshopify.com';
const shopSubdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function extractDomain(untrustedValue: string): string {
  const value = untrustedValue.trim().toLowerCase();
  if (!value) {
    return value;
  }

  if (value.startsWith('https://')) {
    const url = new URL(value);
    if (
      url.username
      || url.password
      || url.port
      || (url.pathname !== '/' && url.pathname !== '')
      || url.search
      || url.hash
    ) {
      throw new Error('Shop URLs must not include credentials, ports, paths, or parameters.');
    }
    return url.hostname;
  }

  if (
    value.includes('://')
    || /[/?#:@]/.test(value)
    || value.endsWith('.')
  ) {
    throw new Error('Shop must be a Shopify store name or HTTPS myshopify.com domain.');
  }

  return value.includes('.')
    ? value
    : `${value}${SHOPIFY_DOMAIN_SUFFIX}`;
}

export const shopDomainSchema = z.string().trim().min(1).max(255).transform(
  (value, context) => {
    let domain: string;
    try {
      domain = extractDomain(value);
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Shopify shop domain.',
      });
      return z.NEVER;
    }

    const suffixIndex = domain.lastIndexOf(SHOPIFY_DOMAIN_SUFFIX);
    const subdomain = suffixIndex > 0 ? domain.slice(0, suffixIndex) : '';
    if (
      suffixIndex !== domain.length - SHOPIFY_DOMAIN_SUFFIX.length
      || !shopSubdomainPattern.test(subdomain)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid myshopify.com shop domain.',
      });
      return z.NEVER;
    }

    return domain;
  },
);

export function normalizeShopDomain(value: string): string {
  return shopDomainSchema.parse(value);
}

export const shopifyConnectInputSchema = z.object({
  shop: shopDomainSchema,
  workspaceId: z.string().uuid(),
}).strict();

export type ShopifyConnectInput = z.infer<typeof shopifyConnectInputSchema>;
