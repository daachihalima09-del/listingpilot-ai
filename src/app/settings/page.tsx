import { notFound, redirect } from 'next/navigation';
import {
  parseTenantRouteContext,
  tenantAwarePath,
  TenantRouteContextError,
} from '@/modules/tenancy/tenant-route-context';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
  }>;
}) {
  try {
    redirect(tenantAwarePath(
      '/settings/organization',
      parseTenantRouteContext(await searchParams),
    ));
  } catch (error) {
    if (error instanceof TenantRouteContextError) notFound();
    throw error;
  }
}
