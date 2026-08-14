import type { Metadata } from 'next';
import { MerchantCatalogProfileForm } from '@/modules/onboarding/catalog-profile/MerchantCatalogProfileForm';
import { resolveMerchantCatalogProfileAccess } from '@/modules/onboarding/catalog-profile/profile-context.server';
import { prismaMerchantCatalogProfileRepository } from '@/modules/onboarding/catalog-profile/prisma-profile-repository.server';
import { getMerchantCatalogProfile } from '@/modules/onboarding/catalog-profile/profile-service';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'Catalog Profile Settings | ListingPilot AI',
};

export default async function CatalogProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantCatalogProfileAccess(user.id, workspace.id);
  const profile = await getMerchantCatalogProfile(
    prismaMerchantCatalogProfileRepository,
    access.workspaceId,
  );

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="Catalog Profile"
      description="Manage the catalog structure ListingPilot uses when preparing future listings. Shopify values remain reviewable and editable inside ListingPilot."
    >
      <MerchantCatalogProfileForm
        workspaceId={access.workspaceId}
        organizationId={access.organizationId}
        workspaceName={access.workspaceName}
        shopName={access.store?.shopName ?? null}
        shopDomain={access.store?.shopDomain ?? null}
        shopifyConnected={access.shopifyConnected}
        canManage={access.role === 'OWNER'}
        initialProfile={profile}
        surface="settings"
      />
    </BusinessProfileSettingsPage>
  );
}
