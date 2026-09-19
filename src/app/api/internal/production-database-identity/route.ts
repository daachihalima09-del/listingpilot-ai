import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/modules/auth/server/context';
import {
  expectedProductionDatabaseIdentity,
  isExpectedProductionDatabase,
  sanitizeDatabaseIdentity,
} from '@/modules/diagnostics/database-identity';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const historicalShopDomain = 'v5kdmx-kj.myshopify.com';
const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

function errorResponse(status: number, code: string): NextResponse {
  return NextResponse.json({ error: { code } }, { status, headers: noStoreHeaders });
}

export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return errorResponse(401, 'AUTH_UNAUTHENTICATED');

  try {
    const tenant = await getTenantContextForUser(user.id);
    if (tenant.role !== 'OWNER' || !tenant.workspace) {
      return errorResponse(403, 'OWNER_REQUIRED');
    }

    const configuredIdentity = sanitizeDatabaseIdentity(env.DATABASE_URL);
    if (!configuredIdentity) {
      return errorResponse(503, 'DATABASE_IDENTITY_UNAVAILABLE');
    }

    const rows = await prisma.$queryRaw<Array<{
      databaseName: string;
      serverVersion: string;
    }>>`
      SELECT
        current_database() AS "databaseName",
        current_setting('server_version') AS "serverVersion"
    `;
    const databaseIdentity = rows[0];
    if (!databaseIdentity) {
      return errorResponse(503, 'DATABASE_IDENTITY_UNAVAILABLE');
    }

    const expectedMatch = isExpectedProductionDatabase(
      configuredIdentity,
      databaseIdentity.databaseName,
    );

    const historicalStore = expectedMatch
      ? await prisma.shopifyStore.findFirst({
          where: {
            workspaceId: tenant.workspace.id,
            shopDomain: historicalShopDomain,
          },
          select: {
            shopDomain: true,
            status: true,
            accessTokenEncrypted: true,
          },
        })
      : null;

    return NextResponse.json({
      provider: configuredIdentity.provider,
      database: databaseIdentity.databaseName,
      serverVersion: databaseIdentity.serverVersion,
      sanitizedIdentity: {
        endpointFamily: configuredIdentity.endpointFamily,
      },
      expected: expectedProductionDatabaseIdentity,
      expectedMatch,
      historicalShopifyRecord: expectedMatch && historicalStore
        ? {
            domain: historicalStore.shopDomain,
            status: historicalStore.status,
            encryptedTokenExists: Boolean(historicalStore.accessTokenEncrypted),
          }
        : null,
    }, { headers: noStoreHeaders });
  } catch {
    return errorResponse(503, 'DATABASE_IDENTITY_UNAVAILABLE');
  }
}
