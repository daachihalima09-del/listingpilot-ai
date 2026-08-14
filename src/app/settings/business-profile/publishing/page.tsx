import type { Metadata } from 'next';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { MerchantPublishingProfileForm } from '@/modules/onboarding/publishing-profile/MerchantPublishingProfileForm';
import { getMerchantPublishingProfile } from '@/modules/onboarding/publishing-profile/publishing-profile-service';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'Publishing Profile Settings | ListingPilot AI',
};

export default async function PublishingProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantListingProfileAccess(user.id, workspace.id);
  const profile = await getMerchantPublishingProfile(access.workspaceId);

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="Publishing Profile"
      description="Review the saved policies that govern how approved content is prepared. Editing this profile does not publish or change Shopify data."
    >
      <MerchantPublishingProfileForm
        workspaceId={access.workspaceId}
        initial={profile}
        surface="settings"
        canManage={access.role === 'OWNER'}
      />
    </BusinessProfileSettingsPage>
  );
}
