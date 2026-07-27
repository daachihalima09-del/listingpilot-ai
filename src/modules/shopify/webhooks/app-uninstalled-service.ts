import { normalizeShopDomain } from '../validators/shop-domain.ts';
import { verifyShopifyWebhookHmac } from './webhook-hmac.ts';

export interface ShopifyUninstallStore {
  disconnectByShopDomain(
    shopDomain: string,
    disconnectedAt: Date,
  ): Promise<{ disconnected: number }>;
}

export class ShopifyWebhookError extends Error {
  constructor() {
    super('The Shopify webhook could not be verified.');
    this.name = 'ShopifyWebhookError';
  }
}

export async function handleShopifyAppUninstalled(
  dependencies: {
    store: ShopifyUninstallStore;
    apiSecret: string;
  },
  input: {
    rawBody: Uint8Array;
    hmac: string | null;
    shopHeader: string | null;
    topic: string | null;
    now?: Date;
  },
): Promise<{ disconnected: number }> {
  if (
    input.topic !== 'app/uninstalled'
    || !verifyShopifyWebhookHmac(
      input.rawBody,
      input.hmac,
      dependencies.apiSecret,
    )
    || !input.shopHeader
  ) {
    throw new ShopifyWebhookError();
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(input.shopHeader);
  } catch {
    throw new ShopifyWebhookError();
  }

  return dependencies.store.disconnectByShopDomain(
    shopDomain,
    input.now ?? new Date(),
  );
}

