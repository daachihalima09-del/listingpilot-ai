import { hashShopifyOAuthState } from './state.ts';

interface CallbackStateRecord {
  userId: string;
  workspaceId: string;
}

interface CallbackTenantBinding {
  organizationId: string;
  workspaceId: string;
  role: string;
}

export interface ShopifyCallbackReturnContextDependencies {
  findState(stateHash: string): Promise<CallbackStateRecord | null>;
  findTenant(
    userId: string,
    workspaceId: string,
  ): Promise<CallbackTenantBinding | null>;
}

function stateFromCallbackUrl(requestUrl: string): string | null {
  const values = new URL(requestUrl).searchParams.getAll('state');
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0])) {
    return null;
  }
  return values[0];
}

/**
 * Recovers only a server-authorized tenant destination for callback errors.
 * It intentionally requires the browser cookie and stored state to agree, so
 * untrusted callback parameters can never select an arbitrary workspace.
 */
export async function resolveShopifyCallbackReturnContext(
  dependencies: ShopifyCallbackReturnContextDependencies,
  input: {
    requestUrl: string;
    cookieState: string | undefined;
    actorUserId: string;
  },
): Promise<{ organizationId: string; workspaceId: string } | null> {
  const queryState = stateFromCallbackUrl(input.requestUrl);
  if (!queryState || !input.cookieState || queryState !== input.cookieState) {
    return null;
  }

  const state = await dependencies.findState(hashShopifyOAuthState(queryState));
  if (!state || state.userId !== input.actorUserId) return null;

  const tenant = await dependencies.findTenant(
    input.actorUserId,
    state.workspaceId,
  );
  if (
    !tenant
    || tenant.role !== 'OWNER'
    || tenant.workspaceId !== state.workspaceId
  ) {
    return null;
  }

  return {
    organizationId: tenant.organizationId,
    workspaceId: tenant.workspaceId,
  };
}
