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

    if (tenant.workspace) {
      const query = new URLSearchParams({
        organizationId: tenant.organization.id,
        workspaceId: tenant.workspace.id,
      });
      redirect(`/projects?${query}`);
    }
  } catch (error) {
    if (!(error instanceof TenantAccessError)) throw error;
  }

  return (
    <section className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-[#081423] p-8 text-center">
      <h1 className="text-2xl font-semibold text-white">No workspace access</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Your account is not currently assigned to a merchant workspace. Contact your organization owner or ListingPilot support.
      </p>
    </section>
  );
}
