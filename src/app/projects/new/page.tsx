import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { CreateProjectForm } from '@/modules/projects/components/CreateProjectForm';
import {
  getProjectPageTenantContext,
  projectTenantQuery,
} from '@/modules/projects/server/project-page-context';
import { TenantAccessError } from '@/modules/tenancy/server/tenant-context';
import { merchantBusinessProfileOnboardingPathIfRequired } from '@/modules/onboarding/catalog-profile/onboarding-gate.server';
import { redirect } from 'next/navigation';

interface NewProjectPageProps {
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
  }>;
}

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const user = await requireAuthenticatedUser();
  const query = await searchParams;

  try {
    const tenant = await getProjectPageTenantContext(user.id, query);
    const tenantQuery = projectTenantQuery(tenant);
    if (tenant.role === 'OWNER') {
      const onboardingPath = await merchantBusinessProfileOnboardingPathIfRequired(
        tenant.workspace.id,
      );
      if (onboardingPath) redirect(onboardingPath);
    }

    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href={`/projects?${tenantQuery}`}
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Saved Projects
        </Link>
        <div className="mt-6 rounded-[2rem] border border-white/10 bg-[#081423] p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
            {tenant.workspace.name}
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Create a project</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Start a durable workspace for product analysis and listing preparation.
          </p>

          {tenant.role === 'OWNER' ? (
            <div className="mt-8">
              <CreateProjectForm
                organizationId={tenant.organization.id}
                workspaceId={tenant.workspace.id}
              />
            </div>
          ) : (
            <div className="mt-8 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Only an organization owner can create projects in this workspace.
            </div>
          )}
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof TenantAccessError) {
      notFound();
    }
    throw error;
  }
}
