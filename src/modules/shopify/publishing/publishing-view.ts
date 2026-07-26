import { shopifyProductIdSchema } from '../products/product-update-validation.ts';
import { shopDomainSchema } from '../validators/shop-domain.ts';
import type {
  ShopifyPublishingAvailability,
  ShopifyPublishingContext,
} from './publication-types.ts';

export function getShopifyPublishingAvailability(
  context: ShopifyPublishingContext,
): ShopifyPublishingAvailability {
  if (!context.configured) return 'CONFIGURATION_MISSING';
  if (!context.connected) return 'NOT_CONNECTED';
  if (!context.canManage) return 'READ_ONLY';
  return context.publication ? 'PUBLISHED' : 'READY';
}

export function buildTrustedShopifyAdminProductUrl(
  shopDomain: unknown,
  productId: unknown,
): string | null {
  const domain = shopDomainSchema.safeParse(shopDomain);
  const id = shopifyProductIdSchema.safeParse(productId);
  if (!domain.success || !id.success) return null;
  return `https://${domain.data}/admin/products/${id.data}`;
}
