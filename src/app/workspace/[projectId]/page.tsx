import { notFound } from 'next/navigation';
import { ZodError } from 'zod';
import { ListingWorkspace } from '@/components/workspace/ListingWorkspace';
import { createServerMerchantPreferenceService } from '@/modules/merchant-preferences/composition.server';
import {
  createMerchantPreferenceRegistry,
  resolveEffectiveMerchantPreferences,
} from '@/modules/merchant-preferences';
import { getListingStandard } from '@/modules/merchant-preferences/listing-standard';
import {
  canonicalGenerationEligibility,
  createProjectListingGenerationPlan,
  type CanonicalGenerationEligibility,
} from '@/modules/listing-generation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { getProjectPageTenantContext } from '@/modules/projects/server/project-page-context';
import { getUserProject } from '@/modules/projects/server/project-operations';
import { getUserProduct } from '@/modules/products/services/product-service.server';
import { ProjectProductsPage } from '@/modules/products/components/ProjectProductsPage';
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
  getUserShopifyImages,
} from '@/modules/shopify/images/image-operations.server';
import {
  getUserPublicationCoordinator,
} from '@/modules/shopify/coordinator/coordinator-operations.server';
import {
  getShopifyConnectionStatus,
} from '@/modules/shopify/services/connection-status';
import { TenantAccessError } from '@/modules/tenancy/server/tenant-context';

interface SavedProjectWorkspacePageProps {
  params: Promise<{
    projectId: string;
    productId?: string;
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
  const routeParams = await params;
  if (!routeParams.productId) {
    return ProjectProductsPage({
      params: Promise.resolve({ projectId: routeParams.projectId }),
      searchParams,
    });
  }
  const user = await requireAuthenticatedUser();
  const { projectId, productId } = routeParams;
  const query = await searchParams;

  try {
    const tenant = await getProjectPageTenantContext(user.id, query);
    const project = productId
      ? await getUserProduct(user.id, {
          workspaceId: tenant.workspace.id,
          projectId,
          productId,
        })
      : await getUserProject(user.id, {
          workspaceId: tenant.workspace.id,
          projectId,
        });
    const configured = hasValidShopifyConfig();
    const merchantPreferences = createServerMerchantPreferenceService();
    const [
      connection,
      publication,
      variantConfiguration,
      metafieldConfiguration,
      imageConfiguration,
      publicationCoordinator,
      businessProfile,
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
      getUserShopifyImages(user.id, project.id),
      getUserPublicationCoordinator(user.id, project.id),
      merchantPreferences.getProfile(tenant.workspace.id),
    ]);
    const effectivePreferences = resolveEffectiveMerchantPreferences(
      tenant.workspace.id,
      businessProfile,
      createMerchantPreferenceRegistry(),
    );
    const connected = (
      connection.status === 'CONNECTED'
      || connection.status === 'ACTIVE'
    );
    const generationEligibility: CanonicalGenerationEligibility | null = !project.analysisData
      ? null
      : businessProfile
        ? canonicalGenerationEligibility(createProjectListingGenerationPlan({
          project,
          effectivePreferences,
          businessProfile,
        }))
        : {
          canGenerate: false,
          status: 'INVALID_CONFIGURATION',
          blockingFindings: [{
            id: 'blocker:INVALID_MERCHANT_PROFILE',
            kind: 'BLOCKING',
            code: 'INVALID_MERCHANT_PROFILE',
            title: 'Merchant profile is incomplete',
            explanation: 'Complete the merchant profile before generating a listing draft.',
            fieldIds: [],
            resolutionArea: 'MERCHANT_PROFILE',
          }],
          warnings: [],
          informationalFindings: [],
          };

    return (
      <ListingWorkspace
        key={project.id}
        initialProject={{
          id: project.id,
          containerProjectId: productId ? projectId : undefined,
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
        listingStyle={{
          standardId: effectivePreferences.listing.standardId,
          standardName: getListingStandard(effectivePreferences.listing.standardId).name,
          fingerprint: effectivePreferences.listing.fingerprint,
        }}
        generationEligibility={generationEligibility}
        generationEligibilityVersion={project.version}
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
        shopifyCoordinator={{
          configured,
          connected,
          canManage: tenant.role === 'OWNER' && project.status !== 'ARCHIVED',
          coordinator: publicationCoordinator,
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
        shopifyImages={{
          configured,
          connected,
          canManage: tenant.role === 'OWNER' && project.status !== 'ARCHIVED',
          hasPublishedProduct: Boolean(publication),
          configuration: imageConfiguration,
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
