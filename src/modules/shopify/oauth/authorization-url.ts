import type { ShopifyConfig } from '../config';

interface ShopifyAuthorizationUrlInput {
  shopDomain: string;
  state: string;
}

export function buildShopifyAuthorizationUrl(
  config: ShopifyConfig,
  input: ShopifyAuthorizationUrlInput,
): string {
  const authorizationUrl = new URL(
    `https://${input.shopDomain}/admin/oauth/authorize`,
  );
  authorizationUrl.searchParams.set('client_id', config.apiKey);
  authorizationUrl.searchParams.set('scope', config.scopes.join(','));
  authorizationUrl.searchParams.set(
    'redirect_uri',
    `${config.appUrl}/api/shopify/callback`,
  );
  authorizationUrl.searchParams.set('state', input.state);
  return authorizationUrl.toString();
}
