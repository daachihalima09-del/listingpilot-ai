import type { ShopifyConnectionStatusDto } from '../services/connection-status.ts';

export type ShopifySettingsViewState =
  | 'CONFIGURATION_MISSING'
  | 'NOT_CONNECTED'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'REAUTHORIZATION_REQUIRED';

export function getShopifySettingsViewState(
  configured: boolean,
  connection: ShopifyConnectionStatusDto,
): ShopifySettingsViewState {
  if (!configured) return 'CONFIGURATION_MISSING';
  if (
    connection.status === 'NOT_CONNECTED'
    || connection.status === 'PENDING'
  ) return 'NOT_CONNECTED';
  if (connection.status === 'DISCONNECTED') return 'DISCONNECTED';
  if (connection.status === 'REVOKED') return 'REAUTHORIZATION_REQUIRED';
  return 'CONNECTED';
}

const statusMessages: Record<string, {
  tone: 'success' | 'error';
  message: string;
}> = {
  connected: {
    tone: 'success',
    message: 'Your Shopify store is connected.',
  },
  disconnected: {
    tone: 'success',
    message: 'ListingPilot access to this Shopify store has been removed.',
  },
};

const errorMessages: Record<string, {
  tone: 'success' | 'error';
  message: string;
}> = {
  invalid_callback: {
    tone: 'error',
    message: 'Shopify returned an invalid connection response. Please try again.',
  },
  invalid_state: {
    tone: 'error',
    message: 'The Shopify connection request expired or is no longer valid.',
  },
  shopify_unavailable: {
    tone: 'error',
    message: 'Shopify could not be reached. Please try again shortly.',
  },
  connection_failed: {
    tone: 'error',
    message: 'The Shopify store could not be connected.',
  },
};

export function getShopifySettingsNotice(query: {
  status?: string;
  error?: string;
}) {
  if (query.status && statusMessages[query.status]) {
    return statusMessages[query.status];
  }
  if (query.error && errorMessages[query.error]) {
    return errorMessages[query.error];
  }
  return null;
}
