import {
  authenticateShopifyComplianceWebhook,
  type AuthenticatedShopifyComplianceWebhook,
} from './webhook-request.ts';

export type ShopifyComplianceOutcome =
  | 'NO_CUSTOMER_DATA_STORED'
  | 'SHOP_REDACTION_POLICY_PENDING'
  | 'UNKNOWN_SHOP';

export interface ShopifyComplianceWebhookStore {
  record(input: AuthenticatedShopifyComplianceWebhook & {
    receivedAt: Date;
  }): Promise<{
    duplicate: boolean;
    knownShop: boolean;
    outcome: ShopifyComplianceOutcome;
  }>;
}

export async function handleShopifyComplianceWebhook(
  dependencies: {
    apiSecret: string;
    store: ShopifyComplianceWebhookStore;
  },
  input: {
    rawBody: Uint8Array;
    headers: Headers;
    now?: Date;
  },
) {
  const delivery = authenticateShopifyComplianceWebhook({
    rawBody: input.rawBody,
    headers: input.headers,
    apiSecret: dependencies.apiSecret,
  });
  const result = await dependencies.store.record({
    ...delivery,
    receivedAt: input.now ?? new Date(),
  });
  return { ...delivery, ...result };
}
