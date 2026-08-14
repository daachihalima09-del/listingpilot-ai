import type { Metadata } from 'next';
import { ListingStandardSelector } from '@/modules/onboarding/listing-profile/ListingStandardSelector';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { getMerchantListingProfile } from '@/modules/onboarding/listing-profile/listing-profile-service';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'Listing Standard Settings | ListingPilot AI',
};

export default async function ListingStandardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantListingProfileAccess(user.id, workspace.id);
  const profile = await getMerchantListingProfile(access.workspaceId);

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="Listing Standard"
      description="Choose the foundation ListingPilot uses for future generated listings, then review its editable rules in Listing Style."
      notice="Changes apply to future generated listings. Existing saved drafts will not be modified."
    >
      <ListingStandardSelector
        workspaceId={access.workspaceId}
        initialVersion={profile?.version ?? null}
        initialStandardId={profile?.data.standardId ?? null}
        surface="settings"
        canManage={access.role === 'OWNER'}
      />
    </BusinessProfileSettingsPage>
  );
}
