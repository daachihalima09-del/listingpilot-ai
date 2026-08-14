import type { Metadata } from 'next';
import { MerchantAiProfileForm } from '@/modules/onboarding/ai-profile/MerchantAiProfileForm';
import { getMerchantAiProfile } from '@/modules/onboarding/ai-profile/ai-profile-service';
import { resolveMerchantListingProfileAccess } from '@/modules/onboarding/listing-profile/listing-profile-context.server';
import { BusinessProfileSettingsPage } from '@/modules/settings/business-profile/BusinessProfileSettingsPage';
import {
  resolveBusinessProfileSettingsTenant,
  type BusinessProfileSettingsSearchParams,
} from '@/modules/settings/business-profile/page-context.server';

export const metadata: Metadata = {
  title: 'AI Profile Settings | ListingPilot AI',
};

export default async function AiProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<BusinessProfileSettingsSearchParams>;
}) {
  const { user, workspace } = await resolveBusinessProfileSettingsTenant(searchParams);
  const access = await resolveMerchantListingProfileAccess(user.id, workspace.id);
  const profile = await getMerchantAiProfile(access.workspaceId);

  return (
    <BusinessProfileSettingsPage
      eyebrow="Business Profile"
      title="AI Profile"
      description="Manage the saved safety, evidence, creativity, review, and localization policies used for future generation work."
    >
      <MerchantAiProfileForm
        workspaceId={access.workspaceId}
        initial={profile}
        surface="settings"
        canManage={access.role === 'OWNER'}
      />
    </BusinessProfileSettingsPage>
  );
}
