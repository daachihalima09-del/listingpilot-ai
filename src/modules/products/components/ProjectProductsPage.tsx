import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { getProjectPageTenantContext } from '@/modules/projects/server/project-page-context';
import { getUserProject } from '@/modules/projects/server/project-operations';
import { ProjectError } from '@/modules/projects/types/errors';
import { listUserProducts } from '../services/product-service.server';
import { ProductListClient } from './ProductListClient';

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    organizationId?: string | string[];
    workspaceId?: string | string[];
  }>;
}

export async function ProjectProductsPage({ params, searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  try {
    const tenant = await getProjectPageTenantContext(user.id, query);
    const [project, products] = await Promise.all([
      getUserProject(user.id, { workspaceId: tenant.workspace.id, projectId }),
      listUserProducts(user.id, { workspaceId: tenant.workspace.id, projectId }),
    ]);
    return (
      <ProductListClient
        project={{ id: project.id, name: project.name }}
        organizationId={tenant.organization.id}
        workspaceId={tenant.workspace.id}
        canManage={tenant.role === 'OWNER' && project.status !== 'ARCHIVED'}
        initialProducts={products.map((product) => ({
          ...product,
          archivedAt: product.archivedAt?.toISOString() ?? null,
          updatedAt: product.updatedAt.toISOString(),
        }))}
      />
    );
  } catch (error) {
    if (error instanceof ProjectError || error instanceof ZodError) notFound();
    throw error;
  }
}
