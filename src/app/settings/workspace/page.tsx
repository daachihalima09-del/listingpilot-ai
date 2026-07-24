import { CalendarDays, ShieldCheck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { WorkspaceSettingsForm } from '@/modules/settings/components/WorkspaceSettingsForm';
import { getTenantContextForUser } from '@/modules/settings/server/tenant-context';
import { SettingsError } from '@/modules/settings/types/errors';

interface WorkspaceSettingsPageProps {
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
  }>;
}

function formatCreationDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

export default async function WorkspaceSettingsPage({
  searchParams,
}: WorkspaceSettingsPageProps) {
  const user = await requireAuthenticatedUser();
  const query = await searchParams;
  const organizationId = typeof query.organizationId === 'string'
    ? query.organizationId
    : undefined;
  const workspaceId = typeof query.workspaceId === 'string'
    ? query.workspaceId
    : undefined;

  let tenant;
  try {
    tenant = await getTenantContextForUser(user.id, {
      organizationId,
      workspaceId,
    });
  } catch (error) {
    if (error instanceof SettingsError) {
      notFound();
    }
    throw error;
  }

  if (!tenant.workspace) {
    notFound();
  }

  const canManage = tenant.role === 'OWNER';

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#081423]/95 p-6 shadow-[0_25px_70px_rgba(0,0,0,0.25)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            Workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Workspace settings
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Manage the workspace where your team prepares and reviews catalog work.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {canManage ? 'Owner access' : tenant.role}
        </div>
      </div>

      <dl className="mt-7">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:max-w-md">
          <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Created
          </dt>
          <dd className="mt-3 text-sm font-medium text-slate-200">
            {formatCreationDate(tenant.workspace.createdAt)}
          </dd>
        </div>
      </dl>

      <WorkspaceSettingsForm
        workspace={tenant.workspace}
        canManage={canManage}
      />
    </div>
  );
}
