import type { Metadata } from 'next';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { MerchantSeoProfileForm } from '@/modules/onboarding/seo-profile/MerchantSeoProfileForm';
import { getMerchantSeoProfile } from '@/modules/onboarding/seo-profile/seo-profile-service';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'SEO Profile Settings | ListingPilot AI',
};

export default async function SeoProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantListingProfileAccess(user.id, workspace.id);
  const profile = await getMerchantSeoProfile(access.workspaceId);

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="SEO Profile"
      description="Manage the saved SEO preferences ListingPilot applies when preparing future product-page content."
    >
      <MerchantSeoProfileForm
        workspaceId={access.workspaceId}
        initial={profile}
        surface="settings"
        canManage={access.role === 'OWNER'}
      />
    </BusinessProfileSettingsPage>
  );
}
