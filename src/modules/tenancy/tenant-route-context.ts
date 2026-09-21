export interface TenantRouteContext {
  organizationId?: string;
  workspaceId?: string;
}

export interface RawTenantRouteContext {
  organizationId?: string | string[];
  workspaceId?: string | string[];
}

export class TenantRouteContextError extends Error {
  constructor() {
    super('The requested tenant context is invalid.');
    this.name = 'TenantRouteContextError';
  }
}

function readSingleValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new TenantRouteContextError();
  }
  return value;
}

export function parseTenantRouteContext(
  input: RawTenantRouteContext,
): TenantRouteContext {
  return {
    organizationId: readSingleValue(input.organizationId),
    workspaceId: readSingleValue(input.workspaceId),
  };
}

export function tenantAwarePath(
  path: string,
  context: TenantRouteContext,
  additionalParameters: Record<string, string | undefined> = {},
): string {
  const url = new URL(path, 'https://listingpilot.invalid');
  if (context.organizationId) {
    url.searchParams.set('organizationId', context.organizationId);
  }
  if (context.workspaceId) {
    url.searchParams.set('workspaceId', context.workspaceId);
  }
  for (const [key, value] of Object.entries(additionalParameters)) {
    if (value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}
