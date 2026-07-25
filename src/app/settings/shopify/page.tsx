import { ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { hasValidShopifyConfig } from '@/modules/shopify/config';
import { ShopifySettingsPanel } from '@/modules/shopify/components/ShopifySettingsPanel';
import { prismaShopifyConnectionStatusStore } from '@/modules/shopify/repositories/prisma-connection-status-store';
import { getShopifyConnectionStatus } from '@/modules/shopify/services/connection-status';
import {
  getShopifySettingsNotice,
  getShopifySettingsViewState,
} from '@/modules/shopify/settings/settings-view';
import { getTenantContextForUser } from '@/modules/tenancy/server/tenant-context';

interface ShopifySettingsPageProps {
  searchParams: Promise<{
    status?: string | string[];
    error?: string | string[];
  }>;
}

export default async function ShopifySettingsPage({
  searchParams,
}: ShopifySettingsPageProps) {
  const user = await requireAuthenticatedUser();
  const tenant = await getTenantContextForUser(user.id);
  if (!tenant.workspace) notFound();

  const configured = hasValidShopifyConfig();
  const connection = await getShopifyConnectionStatus(
    configured
      ? prismaShopifyConnectionStatusStore
      : { async findByWorkspaceId() { return null; } },
    {
      workspaceId: tenant.workspace.id,
      role: tenant.role,
    },
  );
  const query = await searchParams;
  const notice = getShopifySettingsNotice({
    status: typeof query.status === 'string' ? query.status : undefined,
    error: typeof query.error === 'string' ? query.error : undefined,
  });

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#081423]/95 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.25)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            Shopify
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Shopify connection
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Manage the Shopify store connected to this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {connection.canManage ? 'Owner access' : 'View access'}
        </div>
      </div>
      <div className="mt-7">
        <ShopifySettingsPanel
          configured={configured}
          connection={connection}
          viewState={getShopifySettingsViewState(configured, connection)}
          initialNotice={notice}
        />
      </div>
    </div>
  );
}
