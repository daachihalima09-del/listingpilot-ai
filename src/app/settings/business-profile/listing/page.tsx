import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MerchantListingProfileForm } from '@/modules/onboarding/listing-profile/MerchantListingProfileForm';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { getMerchantListingProfile } from '@/modules/onboarding/listing-profile/listing-profile-service';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';
import { businessProfileSettingsPath } from '@/modules/settings/business-profile/routes';

export const metadata: Metadata = {
  title: 'Listing Style Settings | ListingPilot AI',
};

export default async function ListingStyleSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantListingProfileAccess(user.id, workspace.id);
  const profile = await getMerchantListingProfile(access.workspaceId);
  if (!profile) {
    redirect(businessProfileSettingsPath('listing-standard', access.workspaceId));
  }

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="Listing Style"
      description="Edit the title, description, feature, information, tone, and formatting rules already provided by your Listing Profile."
      notice="Changes apply to future generated listings. Existing saved drafts will not be modified."
    >
      <MerchantListingProfileForm
        workspaceId={access.workspaceId}
        initial={profile}
        surface="settings"
        canManage={access.role === 'OWNER'}
      />
    </BusinessProfileSettingsPage>
  );
}
