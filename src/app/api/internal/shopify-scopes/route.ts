import { getCurrentUser } from '@/modules/auth/server/context';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';
import { handleShopifyScopesDiagnostic } from './diagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handleShopifyScopesDiagnostic(request, {
    getUser: getCurrentUser,
    getTenant: (userId, organizationId) => getTenantContextForUser(userId, {
      organizationId,
    }),
    readScopes: () => process.env.SHOPIFY_SCOPES,
  });
}
