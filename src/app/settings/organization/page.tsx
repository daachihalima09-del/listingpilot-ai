import { CalendarDays, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { OrganizationSettingsForm } from '@/modules/settings/components/OrganizationSettingsForm';
import { getTenantContextForUser } from '@/modules/settings/server/tenant-context';
import { SettingsError } from '@/modules/settings/types/errors';

interface OrganizationSettingsPageProps {
  searchParams: Promise<{
    organizationId?: string | string[];
  }>;
}

function formatCreationDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

export default async function OrganizationSettingsPage({
  searchParams,
}: OrganizationSettingsPageProps) {
  const user = await requireAuthenticatedUser();
  const query = await searchParams;
  const organizationId = typeof query.organizationId === 'string'
    ? query.organizationId
    : undefined;

  let tenant;
  try {
    tenant = await getTenantContextForUser(user.id, { organizationId });
  } catch (error) {
    if (error instanceof SettingsError) {
      notFound();
    }
    throw error;
  }

  const canManage = tenant.role === 'OWNER';

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#081423]/95 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.25)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            Organization
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Organization settings
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Manage the identity used to group your workspaces and account data.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {canManage ? 'Owner access' : tenant.role}
        </div>
      </div>

      <dl className="mt-7 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Created
          </dt>
          <dd className="mt-3 text-sm font-medium text-slate-200">
            {formatCreationDate(tenant.organization.createdAt)}
          </dd>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current slug
          </dt>
          <dd className="mt-3 break-all font-mono text-sm text-slate-200">
            {tenant.organization.slug}
          </dd>
        </div>
      </dl>

      <OrganizationSettingsForm
        organization={tenant.organization}
        canManage={canManage}
      />
    </div>
  );
}
