import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { ListingWorkspace } from '@/components/workspace/ListingWorkspace';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { getProjectPageTenantContext } from '@/modules/projects/server/project-page-context';
import { getUserProject } from '@/modules/projects/server/project-operations';
import { ProjectError } from '@/modules/projects/types/errors';
import { hasValidShopifyConfig } from '@/modules/shopify/config';
import {
  prismaShopifyConnectionStatusStore,
} from '@/modules/shopify/repositories/prisma-connection-status-store';
import {
  prismaShopifyProductPublicationRepository,
} from '@/modules/shopify/repositories/prisma-product-publication-repository';
import {
  prismaShopifyVariantRepository,
} from '@/modules/shopify/repositories/prisma-variant-repository';
import {
  buildTrustedShopifyAdminProductUrl,
} from '@/modules/shopify/publishing/publishing-view';
import {
  getUserShopifyMetafields,
} from '@/modules/shopify/metafields/metafield-operations.server';
import {
  getShopifyConnectionStatus,
} from '@/modules/shopify/services/connection-status';
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
    const configured = hasValidShopifyConfig();
    const [
      connection,
      publication,
      variantConfiguration,
      metafieldConfiguration,
    ] = await Promise.all([
      getShopifyConnectionStatus(
        configured
          ? prismaShopifyConnectionStatusStore
          : { async findByWorkspaceId() { return null; } },
        {
          workspaceId: tenant.workspace.id,
          role: tenant.role,
        },
      ),
      prismaShopifyProductPublicationRepository.findForProject(
        tenant.workspace.id,
        project.id,
      ),
      prismaShopifyVariantRepository.getDto(
        tenant.workspace.id,
        project.id,
      ),
      getUserShopifyMetafields(user.id, project.id),
    ]);
    const connected = (
      connection.status === 'CONNECTED'
      || connection.status === 'ACTIVE'
    );

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
        shopifyPublishing={{
          configured,
          connected,
          canManage: tenant.role === 'OWNER' && project.status !== 'ARCHIVED',
          publication,
          adminUrl: connected && publication
            ? buildTrustedShopifyAdminProductUrl(
                connection.shopDomain,
                publication.id,
              )
            : null,
        }}
        shopifyVariants={{
          configured,
          connected,
          canManage: tenant.role === 'OWNER' && project.status !== 'ARCHIVED',
          hasPublishedProduct: Boolean(publication),
          configuration: variantConfiguration,
        }}
        shopifyMetafields={{
          configured,
          connected,
          canManage: tenant.role === 'OWNER' && project.status !== 'ARCHIVED',
          hasPublishedProduct: Boolean(publication),
          configuration: metafieldConfiguration,
        }}
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
