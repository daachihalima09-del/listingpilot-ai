import { ListingWorkspace } from '@/components/workspace/ListingWorkspace';
import { redirect } from 'next/navigation';
import { requireAuthenticatedUser } from '@/modules/auth/server/context';
import { merchantBusinessProfileOnboardingPathIfRequired } from '@/modules/onboarding/catalog-profile/onboarding-gate.server';
import {
  getTenantContextForUser,
  TenantAccessError,
} from '@/modules/tenancy/server/tenant-context';

export default async function HomePage() {
  const user = await requireAuthenticatedUser();
  try {
    const tenant = await getTenantContextForUser(user.id);
    if (tenant.role === 'OWNER' && tenant.workspace) {
      const onboardingPath = await merchantBusinessProfileOnboardingPathIfRequired(
        tenant.workspace.id,
      );
      if (onboardingPath) redirect(onboardingPath);
    }
  } catch (error) {
    if (!(error instanceof TenantAccessError)) throw error;
  }
  return <ListingWorkspace />;
}
