import type { ShopifyConfig } from '../config.ts';
import { ShopifyCallbackError } from '../types/errors.ts';
import {
  hashShopifyOAuthState,
  type ShopifyOAuthStateBinding,
  verifyShopifyOAuthStateBinding,
} from './state.ts';
import { parseShopifyCallbackQuery } from './callback-query.ts';
import { verifyShopifyOAuthHmac } from './hmac.ts';

interface StateRecord extends ShopifyOAuthStateBinding {
  id: string;
}

interface TenantBinding {
  organizationId: string;
  workspaceId: string;
  role: string;
}

interface TokenResult {
  accessToken: string;
  grantedScopes: string[];
}

interface VerifiedShop {
  name: string;
  shopDomain: string;
}

export interface ShopifyCallbackDependencies {
  findState(stateHash: string): Promise<StateRecord | null>;
  consumeState(stateId: string, consumedAt: Date): Promise<void>;
  findTenant(userId: string, workspaceId: string): Promise<TenantBinding | null>;
  exchangeCode(input: {
    shopDomain: string;
    code: string;
  }): Promise<TokenResult>;
  verifyShop(input: {
    shopDomain: string;
    accessToken: string;
  }): Promise<VerifiedShop>;
  encryptToken(token: string): string;
  persistConnection(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    shopDomain: string;
    shopName: string;
    accessTokenEncrypted: string;
    requestedScopes: string[];
    grantedScopes: string[];
    verifiedAt: Date;
  }): Promise<unknown>;
  recordFailure(input: {
    actorUserId: string;
    organizationId: string;
    workspaceId: string;
    shopDomain: string;
    category: string;
  }): Promise<void>;
}

export async function completeShopifyOAuthCallback(
  dependencies: ShopifyCallbackDependencies,
  config: ShopifyConfig,
  input: {
    requestUrl: string;
    cookieState: string | undefined;
    actorUserId: string;
    now?: Date;
  },
): Promise<{
  shopDomain: string;
  workspaceId: string;
  launchIntentId: string | null;
}> {
  const now = input.now ?? new Date();
  const query = parseShopifyCallbackQuery(input.requestUrl, now);
  const state = await dependencies.findState(
    hashShopifyOAuthState(query.state),
  );
  if (!state) {
    throw new ShopifyCallbackError('invalid_state', 'unknown_state');
  }

  const tenant = await dependencies.findTenant(
    input.actorUserId,
    state.workspaceId,
  );
  if (!tenant || tenant.role !== 'OWNER') {
    throw new ShopifyCallbackError('invalid_state', 'tenant_mismatch');
  }
  verifyShopifyOAuthStateBinding(state, {
    queryState: query.state,
    cookieState: input.cookieState,
    actorUserId: input.actorUserId,
    activeWorkspaceId: tenant.workspaceId,
    shopDomain: query.shop,
    now,
  });

  if (!verifyShopifyOAuthHmac(query.searchParams, config.apiSecret)) {
    throw new ShopifyCallbackError('invalid_callback', 'invalid_hmac');
  }
  await dependencies.consumeState(state.id, now);

  try {
    const token = await dependencies.exchangeCode({
      shopDomain: query.shop,
      code: query.code,
    });
    const shop = await dependencies.verifyShop({
      shopDomain: query.shop,
      accessToken: token.accessToken,
    });
    const encryptedToken = dependencies.encryptToken(token.accessToken);
    await dependencies.persistConnection({
      actorUserId: input.actorUserId,
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      shopDomain: shop.shopDomain,
      shopName: shop.name,
      accessTokenEncrypted: encryptedToken,
      requestedScopes: config.scopes,
      grantedScopes: token.grantedScopes,
      verifiedAt: now,
    });
    return {
      shopDomain: shop.shopDomain,
      workspaceId: tenant.workspaceId,
      launchIntentId: state.launchIntentId ?? null,
    };
  } catch (error) {
    const category = error instanceof ShopifyCallbackError
      ? error.safeCategory
      : 'connection_failed';
    try {
      await dependencies.recordFailure({
        actorUserId: input.actorUserId,
        organizationId: tenant.organizationId,
        workspaceId: tenant.workspaceId,
        shopDomain: query.shop,
        category,
      });
    } catch {
      // The original safe failure remains authoritative.
    }
    if (error instanceof ShopifyCallbackError) {
      throw error;
    }
    throw new ShopifyCallbackError(
      'connection_failed',
      'connection_failed',
      { cause: error },
    );
  }
}
