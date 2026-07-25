import Link from 'next/link';
import {
  Archive,
  ArrowRight,
  CalendarDays,
  FolderKanban,
  Plus,
} from 'lucide-react';
import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { ProjectActions } from '@/modules/projects/components/ProjectActions';
import {
  getProjectPageTenantContext,
  projectTenantQuery,
} from '@/modules/projects/server/project-page-context';
import { listUserProjects } from '@/modules/projects/server/project-operations';
import { ProjectError } from '@/modules/projects/types/errors';
import { TenantAccessError } from '@/modules/tenancy/server/tenant-context';

interface ProjectsPageProps {
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
    archived?: string | string[];
  }>;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(value);
}

function sourceLabel(sourceType: string | null): string {
  switch (sourceType) {
    case 'RAW_SPECIFICATIONS':
      return 'Raw specifications';
    case 'SUPPLIER_URL':
      return 'Supplier URL';
    case 'PRODUCT_URL':
      return 'Product URL';
    case 'UPLOADED_PDF':
      return 'Uploaded PDF';
    default:
      return 'No source yet';
  }
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const user = await requireAuthenticatedUser();
  const query = await searchParams;
  const archived = query.archived === '1';

  try {
    const tenant = await getProjectPageTenantContext(user.id, query);
    const projects = await listUserProjects(user.id, {
      workspaceId: tenant.workspace.id,
      archived,
    });
    const canManage = tenant.role === 'OWNER';
    const tenantQuery = projectTenantQuery(tenant);
    const activeHref = `/projects?${tenantQuery}`;
    const archivedHref = `/projects?${tenantQuery}&archived=1`;

    return (
      <div>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              {tenant.workspace.name}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Saved Projects
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              Resume saved product analysis and listing work in this workspace.
            </p>
          </div>
          {canManage ? (
            <Link
              href={`/projects/new?${tenantQuery}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create Project
            </Link>
          ) : null}
        </div>

        <div className="mt-7 flex gap-2 border-b border-white/10 pb-4">
          <Link
            href={activeHref}
            aria-current={!archived ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm transition ${
              !archived
                ? 'bg-amber-400/15 text-amber-200'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            Active
          </Link>
          <Link
            href={archivedHref}
            aria-current={archived ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm transition ${
              archived
                ? 'bg-amber-400/15 text-amber-200'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            Archived
          </Link>
        </div>

        {projects.length ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {projects.map((project) => (
              <article
                key={project.id}
                className="rounded-[1.5rem] border border-white/10 bg-[#081423] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-white">{project.name}</h2>
                    <p className="mt-2 truncate text-sm text-slate-500">
                      {sourceLabel(project.sourceType)}
                      {project.sourceUrl ? ` · ${project.sourceUrl}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                    project.status === 'READY'
                      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                      : project.status === 'ARCHIVED'
                        ? 'border-white/10 bg-white/5 text-slate-400'
                        : 'border-amber-400/20 bg-amber-400/10 text-amber-200'
                  }`}>
                    {project.status}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                      Created
                    </dt>
                    <dd className="mt-2 text-sm text-slate-200">{formatDate(project.createdAt)}</dd>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <dt className="text-xs text-slate-500">Last updated</dt>
                    <dd className="mt-2 text-sm text-slate-200">{formatDate(project.updatedAt)}</dd>
                  </div>
                </dl>

                {project.readiness ? (
                  <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm text-slate-300">
                    {project.readiness.score !== null
                      ? `${project.readiness.score}% catalog quality`
                      : 'Analysis saved'}
                    {' · '}
                    {project.readiness.shopifyReady ? 'Ready to export' : 'Work in progress'}
                  </div>
                ) : null}

                {!archived ? (
                  <Link
                    href={`/workspace/${project.id}?${tenantQuery}`}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200"
                  >
                    Open project
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : null}

                {canManage ? (
                  <ProjectActions
                    project={{
                      id: project.id,
                      workspaceId: project.workspaceId,
                      name: project.name,
                      version: project.version,
                    }}
                    archived={archived}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-[2rem] border border-dashed border-white/15 bg-[#081423]/70 px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
              {archived
                ? <Archive className="h-6 w-6" aria-hidden="true" />
                : <FolderKanban className="h-6 w-6" aria-hidden="true" />}
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">
              {archived ? 'No archived projects' : 'No saved projects yet'}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">
              {archived
                ? 'Archived projects will appear here until they are restored or permanently deleted.'
                : 'Create a project to save analysis, generated listing content, and readiness progress.'}
            </p>
            {!archived && canManage ? (
              <Link
                href={`/projects/new?${tenantQuery}`}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Project
              </Link>
            ) : null}
          </div>
        )}
      </div>
    );
  } catch (error) {
    if (
      error instanceof TenantAccessError
      || error instanceof ProjectError
      || error instanceof ZodError
    ) {
      notFound();
    }
    throw error;
  }
}
