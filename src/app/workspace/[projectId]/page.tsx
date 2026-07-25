import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { ListingWorkspace } from '@/components/workspace/ListingWorkspace';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { getProjectPageTenantContext } from '@/modules/projects/server/project-page-context';
import { getUserProject } from '@/modules/projects/server/project-operations';
import { ProjectError } from '@/modules/projects/types/errors';
import { TenantAccessError } from '@/modules/tenancy/server/tenant-context';

interface SavedProjectWorkspacePageProps {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
  }>;
}

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: SavedProjectWorkspacePageProps) {
  const user = await requireAuthenticatedUser();
  const [{ projectId }, query] = await Promise.all([params, searchParams]);

  try {
    const tenant = await getProjectPageTenantContext(user.id, query);
    const project = await getUserProject(user.id, {
      workspaceId: tenant.workspace.id,
      projectId,
    });

    return (
      <ListingWorkspace
        initialProject={{
          id: project.id,
          organizationId: tenant.organization.id,
          workspaceId: project.workspaceId,
          name: project.name,
          status: project.status,
          version: project.version,
          updatedAt: project.updatedAt.toISOString(),
          sourceType: project.sourceType,
          sourceUrl: project.sourceUrl,
          rawInput: project.rawInput,
          analysisData: project.analysisData,
          generatedListing: project.generatedListing,
          seoData: project.seoData,
          readinessData: project.readinessData,
        }}
        canManage={tenant.role === 'OWNER'}
      />
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
